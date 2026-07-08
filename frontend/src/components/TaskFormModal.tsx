import { useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useCreateTask, useTags, useUpdateTask } from '../api/hooks';
import { useSignalKPaths } from '../api/signalkPaths';
import { slugify } from '../slug';
import { TaskDTO, TaskInput, TimeUnit, TIME_UNITS } from '../types';
import { MarkdownView } from './MarkdownView';

interface FormValues {
  name: string;
  slug: string;
  description: string;
  tags: string[];
  runtime_interval: number | string;
  time_interval: number | string;
  time_interval_unit: TimeUnit | null;
  runtime_path: string;
  last_maintenance: Date | null;
  last_runtime: number | string;
}

/** Create/edit task modal (§7.5). Pass `task` for edit mode. */
export function TaskFormModal({
  opened,
  onClose,
  task,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  task?: TaskDTO;
  onSaved?: (task: TaskDTO) => void;
}) {
  const isEdit = task != null;
  const [slugTouched, setSlugTouched] = useState(false);
  const [descTab, setDescTab] = useState<'write' | 'preview'>('write');
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const tags = useTags();
  // lazy by construction: this hook only mounts when the editor opens (§8.4)
  const skPaths = useSignalKPaths();

  const form = useForm<FormValues>({
    initialValues: {
      name: task?.name ?? '',
      slug: task?.slug ?? '',
      description: task?.description ?? '',
      tags: task?.tags ?? [],
      runtime_interval: task?.runtime_interval ?? '',
      time_interval: task?.time_interval ?? '',
      time_interval_unit: task?.time_interval_unit ?? null,
      runtime_path: task?.runtime_path ?? '',
      last_maintenance: task?.last_maintenance ? new Date(task.last_maintenance) : null,
      last_runtime: task?.last_runtime ?? '',
    },
    validate: {
      name: (v) => (v.trim() ? null : 'Name is required'),
      time_interval: (v, values) =>
        (v === '' || v == null) !== (values.time_interval_unit == null)
          ? 'Set interval and unit together'
          : null,
    },
  });

  const previewSlug = useMemo(
    () => (slugTouched ? slugify(form.values.slug) : slugify(form.values.name || '')),
    [slugTouched, form.values.slug, form.values.name]
  );

  const close = () => {
    form.reset();
    setSlugTouched(false);
    setDescTab('write');
    onClose();
  };

  const submit = form.onSubmit(async (values) => {
    const body: TaskInput = {
      name: values.name.trim(),
      description: values.description || null,
      tags: values.tags,
      runtime_interval: values.runtime_interval === '' ? null : Number(values.runtime_interval),
      time_interval: values.time_interval === '' ? null : Number(values.time_interval),
      time_interval_unit: values.time_interval === '' ? null : values.time_interval_unit,
      runtime_path: values.runtime_path.trim() || null,
    };
    if (isEdit) {
      // send slug only when actually changed (an unchanged slug is a no-op)
      if (values.slug && slugify(values.slug) !== task.slug) body.slug = values.slug;
    } else {
      // create: omit slug unless the user edited the preview (§6.4)
      if (slugTouched && values.slug.trim()) body.slug = values.slug;
      if (values.last_maintenance) body.last_maintenance = values.last_maintenance.toISOString();
      if (values.last_runtime !== '') body.last_runtime = Number(values.last_runtime);
    }

    try {
      const saved = isEdit
        ? await updateTask.mutateAsync({ slug: task.slug, body })
        : await createTask.mutateAsync(body);
      notifications.show({ color: 'green', message: `Task "${saved.name}" saved` });
      onSaved?.(saved);
      close();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Save failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const slugChanged = isEdit && form.values.slug && slugify(form.values.slug) !== task.slug;

  return (
    <Modal opened={opened} onClose={close} title={isEdit ? 'Edit task' : 'New task'} size="lg">
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Name" withAsterisk data-autofocus {...form.getInputProps('name')} />

          {isEdit ? (
            <>
              <TextInput
                label="Slug"
                description="Used in URLs and SignalK notification paths"
                {...form.getInputProps('slug')}
              />
              {slugChanged && (
                <Alert color="yellow" variant="light">
                  Changing the slug breaks existing deep links to this task and moves its
                  SignalK notification path.
                </Alert>
              )}
            </>
          ) : (
            <TextInput
              label="Slug"
              description={slugTouched ? 'Custom slug' : `Auto-generated from name`}
              value={slugTouched ? form.values.slug : previewSlug}
              onChange={(e) => {
                setSlugTouched(true);
                form.setFieldValue('slug', e.currentTarget.value);
              }}
            />
          )}

          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={500}>
                Description (markdown)
              </Text>
              <SegmentedControl
                size="xs"
                value={descTab}
                onChange={(v) => setDescTab(v as 'write' | 'preview')}
                data={[
                  { label: 'Write', value: 'write' },
                  { label: 'Preview', value: 'preview' },
                ]}
              />
            </Group>
            {descTab === 'write' ? (
              <Textarea autosize minRows={3} {...form.getInputProps('description')} />
            ) : (
              <MarkdownView>{form.values.description || '*Nothing to preview*'}</MarkdownView>
            )}
          </div>

          <TagsInput
            label="Tags"
            description="Type to add; suggestions from existing tags"
            data={tags.data?.data.map((t) => t.name) ?? []}
            {...form.getInputProps('tags')}
          />

          <NumberInput
            label="Runtime interval (hours)"
            description="Maintenance due every N runtime hours"
            min={0}
            {...form.getInputProps('runtime_interval')}
          />

          <Group grow>
            <NumberInput
              label="Time interval"
              min={0}
              allowDecimal={false}
              {...form.getInputProps('time_interval')}
            />
            <Select
              label="Unit"
              data={TIME_UNITS}
              clearable
              {...form.getInputProps('time_interval_unit')}
            />
          </Group>

          <Autocomplete
            label="Runtime path"
            description="SignalK path for equipment runtime (free text allowed)"
            placeholder="propulsion.port.runTime"
            data={skPaths.data ?? []}
            limit={30}
            {...form.getInputProps('runtime_path')}
          />

          {!isEdit && (
            <>
              <Text size="sm" c="dimmed">
                Starting point (optional, before any logged maintenance):
              </Text>
              <Group grow>
                <DateTimePicker
                  label="Last maintenance"
                  clearable
                  {...form.getInputProps('last_maintenance')}
                />
                <NumberInput
                  label="Runtime at last maintenance (h)"
                  min={0}
                  {...form.getInputProps('last_runtime')}
                />
              </Group>
            </>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={createTask.isPending || updateTask.isPending}>
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
