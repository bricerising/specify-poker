import React, { useEffect, useMemo, useState } from 'react';

import { testIds } from '../utils/testIds';

interface ProfileFormProps {
  username: string;
  initialAvatarUrl: string | null;
  onSave: (input: { avatarUrl: string | null }) => Promise<void> | void;
}

export function ProfileForm({ username, initialAvatarUrl, onSave }: ProfileFormProps) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAvatarUrl(initialAvatarUrl ?? '');
  }, [initialAvatarUrl]);

  const isValid = useMemo(() => {
    const trimmed = avatarUrl.trim();
    if (!trimmed) {
      return true;
    }
    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, [avatarUrl]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) {
      setError('Avatar URL must be a valid http(s) URL.');
      return;
    }
    setError(null);
    await onSave({
      avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
    });
  };

  return (
    <form className="card profile-panel" onSubmit={handleSubmit}>
      <h3>Profile</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Username</span>
          <input value={username} disabled data-testid={testIds.profile.username} />
        </label>
        <label className="field">
          <span className="field-label">Avatar URL</span>
          <input
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://"
            data-testid={testIds.profile.avatarUrl}
          />
        </label>
      </div>
      <button
        type="submit"
        className="btn btn-primary"
        disabled={!isValid}
        data-testid={testIds.profile.save}
      >
        Save Profile
      </button>
      {error ? (
        <div role="alert" className="alert">
          {error}
        </div>
      ) : null}
    </form>
  );
}
