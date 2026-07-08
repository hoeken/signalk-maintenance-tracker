import { useState } from 'react';
import { Alert, Button, Modal, PasswordInput, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';

export function LoginModal({
  opened,
  onClose,
  onLogin,
}: {
  opened: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm({
    initialValues: { username: '', password: '' },
    validate: {
      username: (v) => (v.trim() ? null : 'Username is required'),
      password: (v) => (v ? null : 'Password is required'),
    },
  });

  const close = () => {
    setError(null);
    form.reset();
    onClose();
  };

  const submit = form.onSubmit(async ({ username, password }) => {
    setBusy(true);
    setError(null);
    try {
      await onLogin(username.trim(), password);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  });

  return (
    <Modal opened={opened} onClose={close} title="Log in to SignalK" centered>
      <form onSubmit={submit}>
        <Stack>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <TextInput
            label="Username"
            autoComplete="username"
            data-autofocus
            {...form.getInputProps('username')}
          />
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            {...form.getInputProps('password')}
          />
          <Button type="submit" loading={busy}>
            Log in
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
