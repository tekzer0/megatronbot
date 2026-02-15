'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLayout } from './page-layout.js';
import { StopIcon, SpinnerIcon, RefreshIcon } from './icons.js';
import { getSwarmStatus, cancelSwarmJob, rerunSwarmJob } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-md bg-border/50" />
        ))}
      </div>
      <div className="h-8 w-32 animate-pulse rounded-md bg-border/50" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-md bg-border/50" />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary Cards
// ─────────────────────────────────────────────────────────────────────────────

function SwarmSummaryCards({ counts }) {
  const cards = [
    { label: 'Running', value: counts.running, color: 'border-l-green-500', text: 'text-green-500' },
    { label: 'Queued', value: counts.queued, color: 'border-l-yellow-500', text: 'text-yellow-500' },
    { label: 'Succeeded', value: counts.succeeded, color: 'border-l-blue-500', text: 'text-blue-500' },
    { label: 'Failed', value: counts.failed, color: 'border-l-red-500', text: 'text-red-500' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-md border border-l-4 ${card.color} bg-card p-4`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{card.label}</p>
          <p className={`text-2xl font-bold mt-1 ${card.text}`}>{card.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Active Jobs
// ─────────────────────────────────────────────────────────────────────────────

function SwarmActiveJobs({ jobs, onCancel }) {
  if (!jobs || jobs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No active jobs.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {jobs.map((job) => {
        const isRunning = job.status === 'in_progress';
        const progress = job.steps_total > 0
          ? Math.round((job.steps_completed / job.steps_total) * 100)
          : 0;

        return (
          <div key={job.run_id} className="rounded-md border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {/* Status dot */}
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    isRunning ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                  }`}
                />
                <span className="font-mono text-sm font-medium">
                  {job.job_id.slice(0, 8)}
                </span>
                {job.workflow_name && (
                  <span className="text-xs text-muted-foreground">
                    {job.workflow_name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatDuration(job.duration_seconds)}
                </span>
                {job.html_url && (
                  <a
                    href={job.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                  >
                    View
                  </a>
                )}
                <button
                  onClick={() => onCancel(job.run_id)}
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="Cancel job"
                >
                  <StopIcon size={14} />
                </button>
              </div>
            </div>

            {/* Current step */}
            {job.current_step && (
              <p className="text-xs text-muted-foreground mb-2 truncate">
                {job.current_step}
              </p>
            )}

            {/* Progress bar */}
            {job.steps_total > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {job.steps_completed}/{job.steps_total}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Job History
// ─────────────────────────────────────────────────────────────────────────────

function SwarmJobHistory({ jobs, onRerun }) {
  if (!jobs || jobs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No completed jobs.
      </div>
    );
  }

  const badgeStyles = {
    success: 'bg-green-500/10 text-green-500',
    failure: 'bg-red-500/10 text-red-500',
    cancelled: 'bg-yellow-500/10 text-yellow-500',
  };

  return (
    <div className="flex flex-col divide-y divide-border">
      {jobs.map((job) => (
        <div key={job.run_id} className="flex items-center gap-3 py-3 px-1">
          {/* Conclusion badge */}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
              badgeStyles[job.conclusion] || 'bg-muted text-muted-foreground'
            }`}
          >
            {job.conclusion || 'unknown'}
          </span>

          {/* Job ID */}
          <span className="font-mono text-sm">{job.job_id.slice(0, 8)}</span>

          {/* Time ago */}
          <span className="text-xs text-muted-foreground">
            {timeAgo(job.updated_at || job.started_at)}
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Actions */}
          <div className="flex items-center gap-2">
            {job.html_url && (
              <a
                href={job.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >
                View
              </a>
            )}
            <button
              onClick={() => onRerun(job.run_id, false)}
              className="text-xs rounded-md px-2 py-1 border hover:bg-accent"
            >
              Rerun
            </button>
            {job.conclusion === 'failure' && (
              <button
                onClick={() => onRerun(job.run_id, true)}
                className="text-xs rounded-md px-2 py-1 border text-red-500 hover:bg-red-500/10"
              >
                Rerun failed
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function SwarmPage({ session }) {
  const [swarmData, setSwarmData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getSwarmStatus();
      setSwarmData(data);
    } catch (err) {
      console.error('Failed to fetch swarm status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  const handleCancel = async (runId) => {
    try {
      await cancelSwarmJob(runId);
      await fetchStatus();
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  const handleRerun = async (runId, failedOnly) => {
    try {
      await rerunSwarmJob(runId, failedOnly);
      await fetchStatus();
    } catch (err) {
      console.error('Failed to rerun job:', err);
    }
  };

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Swarm</h1>
        {!loading && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
          >
            {refreshing ? (
              <>
                <SpinnerIcon size={14} />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshIcon size={14} />
                Refresh
              </>
            )}
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Summary Cards */}
          {swarmData?.counts && (
            <SwarmSummaryCards counts={swarmData.counts} />
          )}

          {/* Active Jobs */}
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Active Jobs
            </h2>
            <SwarmActiveJobs
              jobs={swarmData?.active}
              onCancel={handleCancel}
            />
          </div>

          {/* Job History */}
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
              Recent History
            </h2>
            <SwarmJobHistory
              jobs={swarmData?.completed}
              onRerun={handleRerun}
            />
          </div>
        </div>
      )}
    </PageLayout>
  );
}
