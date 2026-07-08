import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Center,
  Chip,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useDeleteTask, useTags, useTasks } from '../api/hooks';
import { useAuth } from '../auth/AuthProvider';
import { CompleteModal } from '../components/LogEntryModal';
import { SortableTh } from '../components/SortableTh';
import { StatusBadge } from '../components/StatusBadge';
import { TaskFormModal } from '../components/TaskFormModal';
import { formatDate, formatRemainingHours, formatRemainingTime } from '../format';
import { useListParams } from '../hooks/useListParams';
import { Status, TaskDTO } from '../types';

const PAGE_SIZE = 20;
const columnHelper = createColumnHelper<TaskDTO>();

export function TaskListPage() {
  const { isLoggedIn } = useAuth();
  const params = useListParams();
  const deleteTask = useDeleteTask();
  const tags = useTags();

  const search = params.get('search');
  const selectedTags = params.getCsv('tags');
  const sort = params.get('sort') as 'name' | 'remaining_runtime' | 'remaining_time' | undefined;
  const order = params.get('order') as 'asc' | 'desc' | undefined;
  const page = params.getInt('page', 1);

  const tasks = useTasks({
    search,
    tags: selectedTags,
    sort,
    order,
    page,
    pageSize: PAGE_SIZE,
  });

  const [formTask, setFormTask] = useState<TaskDTO | 'new' | null>(null);
  const [completeTask, setCompleteTask] = useState<TaskDTO | null>(null);

  const onSort = (field: string, ord: 'asc' | 'desc') => params.update({ sort: field, order: ord });

  const confirmDelete = (task: TaskDTO) =>
    modals.openConfirmModal({
      title: 'Delete task',
      children: (
        <Text size="sm">
          Delete <b>{task.name}</b> and all of its log entries? This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        deleteTask.mutate(task.slug, {
          onSuccess: () => notifications.show({ color: 'green', message: `Deleted "${task.name}"` }),
          onError: (err) =>
            notifications.show({ color: 'red', title: 'Delete failed', message: err.message }),
        }),
    });

  const columns = useMemo(
    () => [
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={info.getValue<Status>()} />,
      }),
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => (
          <Anchor component={Link} to={`/tasks/${info.row.original.slug}`} fw={500}>
            {info.getValue<string>()}
          </Anchor>
        ),
      }),
      columnHelper.accessor('tags', {
        header: 'Tags',
        cell: (info) => (
          <Group gap={4}>
            {info.getValue<string[]>().map((tag) => (
              <Badge key={tag} size="sm" variant="outline" color="blue">
                {tag}
              </Badge>
            ))}
          </Group>
        ),
      }),
      columnHelper.accessor('remaining_runtime', {
        header: 'Runtime',
        cell: (info) => (
          <Text size="sm" c={colorForRemaining(info.row.original.runtime_status)}>
            {formatRemainingHours(info.getValue<number | null>())}
          </Text>
        ),
      }),
      columnHelper.accessor('remaining_time_ms', {
        header: 'Time',
        cell: (info) => (
          <Text size="sm" c={colorForRemaining(info.row.original.time_status)}>
            {info.getValue<number | null>() == null
              ? '—'
              : `due ${formatRemainingTime(info.getValue<number | null>())}`}
          </Text>
        ),
      }),
      columnHelper.accessor('due_date', {
        header: 'Next due',
        cell: (info) => <Text size="sm">{formatDate(info.getValue<string | null>())}</Text>,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => {
          const task = info.row.original;
          return (
            <Group gap={4} justify="flex-end" wrap="nowrap">
              <Tooltip label="View">
                <ActionIcon component={Link} to={`/tasks/${task.slug}`} variant="subtle">
                  👁
                </ActionIcon>
              </Tooltip>
              {isLoggedIn && (
                <>
                  <Tooltip label="Mark complete">
                    <ActionIcon
                      variant="subtle"
                      color="green"
                      aria-label={`Complete ${task.name}`}
                      onClick={() => setCompleteTask(task)}
                    >
                      ✓
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Edit">
                    <ActionIcon
                      variant="subtle"
                      aria-label={`Edit ${task.name}`}
                      onClick={() => setFormTask(task)}
                    >
                      ✎
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Delete">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Delete ${task.name}`}
                      onClick={() => confirmDelete(task)}
                    >
                      🗑
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
            </Group>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoggedIn]
  );

  const table = useReactTable({
    data: tasks.data?.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
  });

  if (tasks.isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  if (tasks.isError) {
    return (
      <Alert color="red" title="Could not load tasks">
        {tasks.error.message}
      </Alert>
    );
  }

  const { total, pageSize } = tasks.data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Stack>
      <Group justify="space-between">
        <Group gap="xs">
          {(tags.data?.data ?? []).map((tag) => (
            <Chip
              key={tag.id}
              size="xs"
              checked={selectedTags.some((t) => t.toLowerCase() === tag.name.toLowerCase())}
              onChange={(checked) =>
                params.update({
                  tags: checked
                    ? [...selectedTags, tag.name]
                    : selectedTags.filter((t) => t.toLowerCase() !== tag.name.toLowerCase()),
                })
              }
            >
              {tag.name} ({tag.count})
            </Chip>
          ))}
        </Group>
        {isLoggedIn && <Button onClick={() => setFormTask('new')}>New task</Button>}
      </Group>

      {total === 0 ? (
        <Alert color="blue" variant="light" title="No tasks">
          {search || selectedTags.length
            ? 'Nothing matches the current search/filter.'
            : isLoggedIn
              ? 'Create your first maintenance task with "New task".'
              : 'No maintenance tasks yet. Log in to create one.'}
        </Alert>
      ) : (
        <>
          <Table.ScrollContainer minWidth={760}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Status</Table.Th>
                  <SortableTh field="name" sort={sort} order={order} onSort={onSort}>
                    Name
                  </SortableTh>
                  <Table.Th>Tags</Table.Th>
                  <SortableTh field="remaining_runtime" sort={sort} order={order} onSort={onSort}>
                    Runtime
                  </SortableTh>
                  <SortableTh field="remaining_time" sort={sort} order={order} onSort={onSort}>
                    Time
                  </SortableTh>
                  <Table.Th>Next due</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {table.getRowModel().rows.map((row) => (
                  <Table.Tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <Table.Td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </Table.Td>
                    ))}
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

      {formTask !== null && (
        <TaskFormModal
          opened
          onClose={() => setFormTask(null)}
          task={formTask === 'new' ? undefined : formTask}
        />
      )}
      {completeTask && (
        <CompleteModal opened onClose={() => setCompleteTask(null)} task={completeTask} />
      )}
    </Stack>
  );
}

function colorForRemaining(status: Status | null): string | undefined {
  if (status === 'overdue') return 'red';
  if (status === 'due_soon') return 'yellow.8';
  return undefined;
}
