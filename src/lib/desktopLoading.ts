export type DesktopLoadingTask = {
  id: string;
  weight?: number;
  complete?: boolean;
  progress?: number;
};

export type DesktopLoadingProgress = {
  percent: number;
  completed: number;
  total: number;
};

export function clampLoadingPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function aggregateLoadingProgress(tasks: DesktopLoadingTask[]): DesktopLoadingProgress {
  if (!tasks.length) return { percent: 100, completed: 0, total: 0 };
  const totalWeight = tasks.reduce((sum, task) => sum + Math.max(0, task.weight ?? 1), 0) || 1;
  const achievedWeight = tasks.reduce((sum, task) => {
    const weight = Math.max(0, task.weight ?? 1);
    const progress = task.complete ? 100 : clampLoadingPercent(task.progress ?? 0);
    return sum + weight * (progress / 100);
  }, 0);
  return {
    percent: clampLoadingPercent((achievedWeight / totalWeight) * 100),
    completed: tasks.filter((task) => task.complete).length,
    total: tasks.length,
  };
}

