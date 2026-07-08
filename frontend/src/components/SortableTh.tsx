import { ReactNode } from 'react';
import { Group, Table, Text, UnstyledButton } from '@mantine/core';

/** Column header that cycles asc → desc on click (server-side sorting). */
export function SortableTh({
  children,
  field,
  sort,
  order,
  onSort,
}: {
  children: ReactNode;
  field: string;
  sort?: string;
  order?: string;
  onSort: (field: string, order: 'asc' | 'desc') => void;
}) {
  const active = sort === field;
  const nextOrder = active && order === 'asc' ? 'desc' : 'asc';
  return (
    <Table.Th>
      <UnstyledButton onClick={() => onSort(field, nextOrder)}>
        <Group gap={4} wrap="nowrap">
          <Text size="sm" fw={600}>
            {children}
          </Text>
          <Text size="xs" c="dimmed">
            {active ? (order === 'asc' ? '▲' : '▼') : '↕'}
          </Text>
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}
