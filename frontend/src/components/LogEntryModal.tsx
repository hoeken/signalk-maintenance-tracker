import { Button, Group, Modal, NumberInput, Stack, Textarea } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useAddLog, useUpdateLog } from '../api/hooks';
import { LogEntry, TaskDTO } from '../types';

/**
 * "Mark complete" modal (§7.5): datetime defaults to now, runtime hours
 * prefilled from the task's current_runtime (from the plugin /tasks API —
 * never read from SignalK directly, §8.4).
 */
export function CompleteModal({
  opened,
  onClose,
  task,
}: {
  opened: boolean;
  onClose: () => void;
  task: TaskDTO;
}) {
  const addLog = useAddLog();
  return (
    <LogEntryForm
      opened={opened}
      onClose={onClose}
      title={`Mark "${task.name}" complete`}
      submitLabel="Mark complete"
      initial={{
        maintenance_date: new Date(),
        runtime_hours: task.current_runtime ?? '',
        notes: '',
      }}
      busy={addLog.isPending}
      onSubmit={(body) => addLog.mutateAsync({ slug: task.slug, body })}
    />
  );
}

/** Edit an existing log entry (task detail / master log tables, §7.4). */
export function EditLogModal({
  opened,
  onClose,
  entry,
  taskName,
}: {
  opened: boolean;
  onClose: () => void;
  entry: LogEntry;
  taskName?: string;
}) {
  const updateLog = useUpdateLog();
  return (
    <LogEntryForm
      opened={opened}
      onClose={onClose}
      title={taskName ? `Edit log entry — ${taskName}` : 'Edit log entry'}
      submitLabel="Save"
      initial={{
        maintenance_date: new Date(entry.maintenance_date),
        runtime_hours: entry.runtime_hours ?? '',
        notes: entry.notes ?? '',
      }}
      busy={updateLog.isPending}
      onSubmit={(body) => updateLog.mutateAsync({ id: entry.id, body })}
    />
  );
}

interface LogFormValues {
  maintenance_date: Date | null;
  runtime_hours: number | string;
  notes: string;
}

function LogEntryForm({
  opened,
  onClose,
  title,
  submitLabel,
  initial,
  busy,
  onSubmit,
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial: LogFormValues;
  busy: boolean;
  onSubmit: (body: {
    maintenance_date: string;
    runtime_hours: number | null;
    notes: string | null;
  }) => Promise<unknown>;
}) {
  const form = useForm<LogFormValues>({
    initialValues: initial,
    validate: {
      maintenance_date: (v) => (v ? null : 'Date is required'),
    },
  });

  const close = () => {
    form.reset();
    onClose();
  };

  const submit = form.onSubmit(async (values) => {
    try {
      await onSubmit({
        maintenance_date: values.maintenance_date!.toISOString(),
        runtime_hours: values.runtime_hours === '' ? null : Number(values.runtime_hours),
        notes: values.notes || null,
      });
      notifications.show({ color: 'green', message: 'Log entry saved' });
      close();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return (
    <Modal opened={opened} onClose={close} title={title}>
      <form onSubmit={submit}>
        <Stack>
          <DateTimePicker
            label="Maintenance date"
            withAsterisk
            {...form.getInputProps('maintenance_date')}
          />
          <NumberInput
            label="Runtime hours"
            description="Equipment runtime at completion (optional)"
            min={0}
            {...form.getInputProps('runtime_hours')}
          />
          <Textarea
            label="Notes (markdown)"
            autosize
            minRows={3}
            {...form.getInputProps('notes')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {submitLabel}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
