import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Progress,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useDeleteLog, useDeleteTask, useTask, useTaskLogs } from '../api/hooks';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { CompleteModal, EditLogModal } from '../components/LogEntryModal';
import { MarkdownView } from '../components/MarkdownView';
import { StatusBadge } from '../components/StatusBadge';
import { TaskFormModal } from '../components/TaskFormModal';
import {
  formatDateTime,
  formatHours,
  formatRemainingHours,
  formatRemainingTime,
} from '../format';
import { LogEntry, TaskDTO } from '../types';

export function TaskDetailPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const task = useTask(slug);
  const logs = useTaskLogs(slug);
  const deleteTask = useDeleteTask();

  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);

  if (task.isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  if (task.isError) {
    const notFound = task.error instanceof ApiError && task.error.status === 404;
    return (
      <Alert color={notFound ? 'yellow' : 'red'} title={notFound ? 'Task not found' : 'Error'}>
        {notFound ? (
          <>
            No task with slug “{slug}”. It may have been renamed or deleted.{' '}
            <Anchor component={Link} to="/">
              Back to task list
            </Anchor>
          </>
        ) : (
          task.error.message
        )}
      </Alert>
    );
  }

  const t = task.data;

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Delete task',
      children: (
        <Text size="sm">
          Delete <b>{t.name}</b> and all of its log entries? This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        deleteTask.mutate(t.slug, {
          onSuccess: () => {
            notifications.show({ color: 'green', message: `Deleted "${t.name}"` });
            navigate('/');
          },
          onError: (err) =>
            notifications.show({ color: 'red', title: 'Delete failed', message: err.message }),
        }),
    });

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Group gap="sm">
            <Title order={2}>{t.name}</Title>
            <StatusBadge status={t.status} />
          </Group>
          <Group gap={4}>
            {t.tags.map((tag) => (
              <Badge key={tag} size="sm" variant="outline" color="blue">
                {tag}
              </Badge>
            ))}
          </Group>
        </Stack>
        {isLoggedIn && (
          <Group gap="xs">
            <Button color="green" onClick={() => setCompleting(true)}>
              Mark complete
            </Button>
            <Button variant="default" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="light" color="red" onClick={confirmDelete}>
              Delete
            </Button>
          </Group>
        )}
      </Group>

      {t.description && (
        <Card withBorder>
          <MarkdownView>{t.description}</MarkdownView>
        </Card>
      )}

      <Group grow align="stretch">
        <DimensionCard
          title="Runtime"
          active={t.runtime_interval != null || t.runtime_path != null || t.last_runtime != null}
          fraction={t.runtime_fraction}
          rows={[
            ['Interval', t.runtime_interval != null ? `${t.runtime_interval} h` : '—'],
            ['SignalK path', t.runtime_path ?? '—'],
            ['Current runtime', formatHours(t.current_runtime)],
            ['At last maintenance', formatHours(t.last_runtime)],
            ['Elapsed', formatHours(t.elapsed_runtime)],
            ['Remaining', formatRemainingHours(t.remaining_runtime)],
            ['Due at', t.due_runtime_at != null ? formatHours(t.due_runtime_at) : '—'],
          ]}
        />
        <DimensionCard
          title="Time"
          active={t.time_interval != null || t.last_maintenance != null}
          fraction={t.time_fraction}
          rows={[
            [
              'Interval',
              t.time_interval != null ? `${t.time_interval} ${t.time_interval_unit}` : '—',
            ],
            ['Last maintenance', formatDateTime(t.last_maintenance)],
            ['Next due', formatDateTime(t.due_date)],
            ['Remaining', t.remaining_time_ms != null ? formatRemainingTime(t.remaining_time_ms) : '—'],
          ]}
        />
      </Group>

      <Title order={3} mt="md">
        Maintenance log
      </Title>
      <TaskLogTable taskName={t.name} logs={logs.data?.data ?? []} />

      {editing && <TaskFormModal opened onClose={() => setEditing(false)} task={t} onSaved={(saved: TaskDTO) => saved.slug !== slug && navigate(`/tasks/${saved.slug}`)} />}
      {completing && <CompleteModal opened onClose={() => setCompleting(false)} task={t} />}
    </Stack>
  );
}

function DimensionCard({
  title,
  active,
  fraction,
  rows,
}: {
  title: string;
  active: boolean;
  fraction: number | null;
  rows: [string, string][];
}) {
  return (
    <Card withBorder>
      <Text fw={600} mb="xs">
        {title}
      </Text>
      {!active ? (
        <Text size="sm" c="dimmed">
          Not tracked for this task.
        </Text>
      ) : (
        <Stack gap="xs">
          {fraction != null && (
            <Progress
              value={Math.min(100, Math.max(0, fraction * 100))}
              color={fraction >= 1 ? 'red' : fraction >= 0.85 ? 'yellow' : 'green'}
            />
          )}
          {rows.map(([label, value]) => (
            <Group key={label} justify="space-between" gap="xs">
              <Text size="sm" c="dimmed">
                {label}
              </Text>
              <Text size="sm">{value}</Text>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}

function TaskLogTable({ taskName, logs }: { taskName: string; logs: LogEntry[] }) {
  const { isLoggedIn } = useAuth();
  const deleteLog = useDeleteLog();
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);

  const confirmDelete = (entry: LogEntry) =>
    modals.openConfirmModal({
      title: 'Delete log entry',
      children: <Text size="sm">Delete this log entry? This cannot be undone.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        deleteLog.mutate(entry.id, {
          onError: (err) =>
            notifications.show({ color: 'red', title: 'Delete failed', message: err.message }),
        }),
    });

  if (!logs.length) {
    return (
      <Text size="sm" c="dimmed">
        No maintenance logged yet.
      </Text>
    );
  }

  return (
    <>
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Date</Table.Th>
            <Table.Th>Runtime</Table.Th>
            <Table.Th>Notes</Table.Th>
            <Table.Th>Logged by</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {logs.map((entry) => (
            <Table.Tr key={entry.id}>
              <Table.Td>{formatDateTime(entry.maintenance_date)}</Table.Td>
              <Table.Td>{formatHours(entry.runtime_hours)}</Table.Td>
              <Table.Td>{entry.notes ? <MarkdownView>{entry.notes}</MarkdownView> : '—'}</Table.Td>
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
                      <ActionIcon variant="subtle" color="red" onClick={() => confirmDelete(entry)}>
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
      {editingEntry && (
        <EditLogModal
          opened
          onClose={() => setEditingEntry(null)}
          entry={editingEntry}
          taskName={taskName}
        />
      )}
    </>
  );
}
