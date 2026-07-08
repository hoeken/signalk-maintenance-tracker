import { FormEvent, useEffect, useState } from 'react';
import { NavLink as RouterNavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Anchor, AppShell, Container, Group, TextInput, Title } from '@mantine/core';
import { AuthControl } from './components/AuthControl';
import { ThemeToggle } from './components/ThemeToggle';
import { useListParams } from './hooks/useListParams';
import { MasterLogPage } from './pages/MasterLogPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { TaskListPage } from './pages/TaskListPage';

export function App() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="lg" wrap="nowrap">
            <Title order={4} textWrap="nowrap">
              ⚓ Maintenance
            </Title>
            <Group gap="sm" visibleFrom="xs">
              <NavAnchor to="/">Tasks</NavAnchor>
              <NavAnchor to="/log">Log</NavAnchor>
            </Group>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <GlobalSearch />
            <ThemeToggle />
            <AuthControl />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl">
          <Routes>
            <Route path="/" element={<TaskListPage />} />
            <Route path="/tasks/:slug" element={<TaskDetailPage />} />
            <Route path="/log" element={<MasterLogPage />} />
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

function NavAnchor({ to, children }: { to: string; children: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Anchor component={RouterNavLink} to={to} end fw={isActive ? 700 : 400} c="inherit">
      {children}
    </Anchor>
  );
}

/**
 * Global search (§7.2). Applies the `search` query param to the list page
 * you're on (tasks or master log); from anywhere else it navigates to the
 * task list with the search applied.
 */
function GlobalSearch() {
  const params = useListParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [value, setValue] = useState(params.get('search') ?? '');

  // keep the box in sync when the URL changes (back/forward, link clicks)
  useEffect(() => {
    setValue(params.get('search') ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const onListPage = location.pathname === '/' || location.pathname === '/log';
    if (onListPage) {
      params.update({ search: value });
    } else {
      navigate(`/?${new URLSearchParams(value ? { search: value } : {})}`);
    }
  };

  return (
    <form onSubmit={submit}>
      <TextInput
        placeholder="Search…"
        size="xs"
        w={180}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        aria-label="Search"
      />
    </form>
  );
}
