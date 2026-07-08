import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Center,
  Group,
  Loader,
  Pagination,
  Spoiler,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useDeleteLog, useLogs } from '../api/hooks';
import { useAuth } from '../auth/AuthProvider';
import { EditLogModal } from '../components/LogEntryModal';
import { MarkdownView } from '../components/MarkdownView';
import { SortableTh } from '../components/SortableTh';
import { formatDateTime, formatHours } from '../format';
import { useListParams } from '../hooks/useListParams';
import { MasterLogEntry } from '../types';

const PAGE_SIZE = 25;

/** Master log (§7.4): one row per log entry across all tasks. */
export function MasterLogPage() {
  const { isLoggedIn } = useAuth();
  const params = useListParams();
  const deleteLog = useDeleteLog();

  const search = params.get('search');
  const sort = params.get('sort') as 'maintenance_date' | 'task' | 'runtime_hours' | undefined;
  const order = params.get('order') as 'asc' | 'desc' | undefined;
  const page = params.getInt('page', 1);

  const logs = useLogs({ search, sort, order, page, pageSize: PAGE_SIZE });
  const [editingEntry, setEditingEntry] = useState<MasterLogEntry | null>(null);

  const onSort = (field: string, ord: 'asc' | 'desc') => params.update({ sort: field, order: ord });

  const confirmDelete = (entry: MasterLogEntry) =>
    modals.openConfirmModal({
      title: 'Delete log entry',
      children: (
        <Text size="sm">
          Delete this log entry for <b>{entry.task_name}</b>? This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        deleteLog.mutate(entry.id, {
          onError: (err) =>
            notifications.show({ color: 'red', title: 'Delete failed', message: err.message }),
        }),
    });

  if (logs.isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  if (logs.isError) {
    return (
      <Alert color="red" title="Could not load the log">
        {logs.error.message}
      </Alert>
    );
  }

  const { data, total, pageSize } = logs.data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Stack>
      {total === 0 ? (
        <Alert color="blue" variant="light" title="No log entries">
          {search
            ? 'Nothing matches the current search.'
            : 'Completed maintenance will appear here.'}
        </Alert>
      ) : (
        <>
          <Table.ScrollContainer minWidth={700}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <SortableTh field="task" sort={sort} order={order} onSort={onSort}>
                    Task
                  </SortableTh>
                  <SortableTh field="maintenance_date" sort={sort} order={order} onSort={onSort}>
                    Date
                  </SortableTh>
                  <SortableTh field="runtime_hours" sort={sort} order={order} onSort={onSort}>
                    Runtime
                  </SortableTh>
                  <Table.Th>Notes</Table.Th>
                  <Table.Th>Logged by</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((entry) => (
                  <Table.Tr key={entry.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/tasks/${entry.task_slug}`} fw={500}>
                        {entry.task_name}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{formatDateTime(entry.maintenance_date)}</Table.Td>
                    <Table.Td>{formatHours(entry.runtime_hours)}</Table.Td>
                    <Table.Td maw={400}>
                      {entry.notes ? (
                        <Spoiler maxHeight={24} showLabel="more" hideLabel="less">
                          <MarkdownView>{entry.notes}</MarkdownView>
                        </Spoiler>
                      ) : (
                        '—'
                      )}
                    </Table.Td>
                    <Table.Td>{entry.logged_by ?? '—'}</Table.Td>
                    <Table.Td>
                      {isLoggedIn && (
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          <Tooltip label="Edit entry">
                            <ActionIcon variant="subtle" onClick={() => setEditingEntry(entry)}>
                              ✎
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Delete entry">
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              onClick={() => confirmDelete(entry)}
                            >
                              🗑
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          {totalPages > 1 && (
            <Group justify="center">
              <Pagination
                total={totalPages}
                value={page}
                onChange={(p) => params.update({ page: p }, false)}
              />
            </Group>
          )}
        </>
      )}

      {editingEntry && (
        <EditLogModal
          opened
          onClose={() => setEditingEntry(null)}
          entry={editingEntry}
          taskName={editingEntry.task_name}
        />
      )}
    </Stack>
  );
}
