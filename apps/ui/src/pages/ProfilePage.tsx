import React, { useEffect, useState } from "react";
import { trace } from "@opentelemetry/api";

import { ProfileForm } from "../components/ProfileForm";
import { fetchProfile, updateProfile, UserProfile } from "../services/profileApi";

interface ProfilePageProps {
  onProfileUpdated?: (profile: UserProfile) => void;
}

export function ProfilePage({ onProfileUpdated }: ProfilePageProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const loadProfile = async () => {
    setStatus("loading");
    try {
      const next = await fetchProfile();
      setProfile(next);
      onProfileUpdated?.(next);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load profile";
      setError(message);
    } finally {
      setStatus("idle");
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (!profile) {
      return;
    }
    const tracer = trace.getTracer("ui");
    const span = tracer.startSpan("ui.profile.render", {
      attributes: {
        "poker.user_id": profile.userId,
      },
    });
    span.end();
  }, [profile?.userId]);

  const handleSave = async (input: { avatarUrl: string | null }) => {
    try {
      const updated = await updateProfile(input);
      setProfile(updated);
      onProfileUpdated?.(updated);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update profile";
      setError(message);
    }
  };

  if (!profile) {
    return <div>{status === "loading" ? "Loading profile..." : "Profile unavailable."}</div>;
  }

  const initials = profile.username.slice(0, 2).toUpperCase();

  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h2>Profile & Stats</h2>
          <p>Keep your poker identity tidy and share a consistent avatar with the table.</p>
        </div>
      </div>
      <div className="profile-grid">
        <div className="card profile-panel">
          <div className="profile-summary">
            <div className="avatar">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={`${profile.username} avatar`} />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div>
              <div className="meta-line">Username</div>
              <div className="table-name">{profile.username}</div>
            </div>
          </div>
          <div className="stat-grid">
            <div className="stat">
              <strong>{profile.stats.handsPlayed}</strong>
              Hands Played
            </div>
            <div className="stat">
              <strong>{profile.stats.wins}</strong>
              Wins
            </div>
          </div>
        </div>
        <ProfileForm
          username={profile.username}
          initialAvatarUrl={profile.avatarUrl}
          onSave={handleSave}
        />
      </div>
      {error ? (
        <div role="alert" className="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
