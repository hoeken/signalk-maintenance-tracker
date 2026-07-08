import { Badge } from '@mantine/core';
import { STATUS_COLOR, STATUS_LABEL } from '../format';
import { Status } from '../types';

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge color={STATUS_COLOR[status]} variant="light" data-testid="status-badge">
      {STATUS_LABEL[status]}
    </Badge>
  );
}
