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

  const handleSave = async (input: { nickname: string; avatarUrl: string | null }) => {
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

  return (
    <section>
      <h2>Profile & Stats</h2>
      <div>Nickname: {profile.nickname}</div>
      <div>Hands Played: {profile.stats.handsPlayed}</div>
      <div>Wins: {profile.stats.wins}</div>
      <ProfileForm
        initialNickname={profile.nickname}
        initialAvatarUrl={profile.avatarUrl}
        onSave={handleSave}
      />
      {error ? <div role="alert">{error}</div> : null}
    </section>
  );
}
