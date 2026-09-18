import { useState } from 'react';
import Header from './components/Header';
import Login from './components/Login';
import ManagerView from './components/ManagerView';
import MemberView from './components/MemberView';
import {
  clearSession,
  loadSession,
  saveSession,
  type SessionUser,
} from './session/session';

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(() => loadSession());

  function handleLogin(next: SessionUser): void {
    saveSession(next);
    setUser(next);
  }

  function handleSwitchUser(): void {
    clearSession();
    setUser(null);
  }

  if (user === null) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <Header user={user} onSwitchUser={handleSwitchUser} />
      <main className="app-main">
        {user.role === 'manager' ? (
          <ManagerView user={user} />
        ) : (
          <MemberView user={user} />
        )}
      </main>
    </div>
  );
}
