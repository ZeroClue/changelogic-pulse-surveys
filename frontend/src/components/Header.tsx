import { roleLabel } from './format';
import type { SessionUser } from '../session/session';

interface HeaderProps {
  user: SessionUser;
  onSwitchUser: () => void;
}

/** Persistent identity bar: who you are, where, and a way to change it. */
export default function Header({ user, onSwitchUser }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-identity">
        <span className="app-header-name">{user.name}</span>
        <span className="app-header-meta">
          {roleLabel(user.role)} @ {user.organization}
        </span>
      </div>
      <button type="button" className="button button-quiet" onClick={onSwitchUser}>
        Switch user
      </button>
    </header>
  );
}
