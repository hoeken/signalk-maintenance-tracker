import { Anchor, Button, Group, Text } from '@mantine/core';
import { useAuth } from '../auth/AuthProvider';

/** Header auth control (§7.2): "Log in" when anonymous, username + "Log out"
 * when authenticated. */
export function AuthControl() {
  const { isLoggedIn, username, logout, openLoginModal } = useAuth();

  if (!isLoggedIn) {
    return (
      <Button variant="light" size="xs" onClick={openLoginModal}>
        Log in
      </Button>
    );
  }

  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm" fw={500}>
        {username ?? 'Logged in'}
      </Text>
      <Anchor component="button" size="sm" onClick={() => void logout()}>
        Log out
      </Anchor>
    </Group>
  );
}
