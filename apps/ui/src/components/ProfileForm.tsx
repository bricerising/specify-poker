import React, { useEffect, useMemo, useState } from "react";

interface ProfileFormProps {
  initialNickname: string;
  initialAvatarUrl: string | null;
  onSave: (input: { nickname: string; avatarUrl: string | null }) => Promise<void> | void;
}

export function ProfileForm({ initialNickname, initialAvatarUrl, onSave }: ProfileFormProps) {
  const [nickname, setNickname] = useState(initialNickname);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNickname(initialNickname);
    setAvatarUrl(initialAvatarUrl ?? "");
  }, [initialNickname, initialAvatarUrl]);

  const isValid = useMemo(() => {
    const trimmed = nickname.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      return false;
    }
    return true;
  }, [nickname]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValid) {
      setError("Nickname must be 2-20 characters.");
      return;
    }
    setError(null);
    await onSave({
      nickname: nickname.trim(),
      avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
    });
  };

  return (
    <form className="card profile-panel" onSubmit={handleSubmit}>
      <h3>Profile</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Nickname</span>
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Avatar URL</span>
          <input
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://"
          />
        </label>
      </div>
      <button type="submit" className="btn btn-primary" disabled={!isValid}>
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
