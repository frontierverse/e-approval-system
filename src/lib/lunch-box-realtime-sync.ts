export type LunchBoxRealtimeSyncCoordinator = {
  completedVersion: number;
  date: string;
  inFlight: Promise<void> | null;
  lastSucceededVersion: number;
  requestedVersion: number;
};

type LunchBoxRealtimeSyncLoadResult<T> =
  | { data: T; ok: true }
  | { ok: false };

type RequestLunchBoxRealtimeSyncOptions<T> = {
  apply: (data: T) => void;
  coordinator: LunchBoxRealtimeSyncCoordinator;
  isActive: () => boolean;
  load: (date: string) => Promise<LunchBoxRealtimeSyncLoadResult<T>>;
  onFailure: () => void;
};

export function createLunchBoxRealtimeSyncCoordinator(
  date: string,
): LunchBoxRealtimeSyncCoordinator {
  return {
    completedVersion: 0,
    date,
    inFlight: null,
    lastSucceededVersion: 0,
    requestedVersion: 0,
  };
}

export async function requestLunchBoxRealtimeSync<T>({
  apply,
  coordinator,
  isActive,
  load,
  onFailure,
}: RequestLunchBoxRealtimeSyncOptions<T>) {
  if (!isActive()) {
    return false;
  }

  const requestedVersion = ++coordinator.requestedVersion;

  function reportFailure() {
    try {
      onFailure();
    } catch {
      // A UI reporting failure must not break coordinator cleanup.
    }
  }

  function ensureSyncLoop() {
    if (coordinator.inFlight || !isActive()) {
      return;
    }

    const syncLoop = (async () => {
      while (
        isActive() &&
        coordinator.completedVersion < coordinator.requestedVersion
      ) {
        const targetVersion = coordinator.requestedVersion;
        let succeeded = false;

        try {
          const result = await load(coordinator.date);

          if (!isActive()) {
            coordinator.completedVersion = targetVersion;
            continue;
          }

          if (result.ok) {
            apply(result.data);
            succeeded = true;
          } else {
            reportFailure();
          }
        } catch {
          reportFailure();
        }

        coordinator.completedVersion = targetVersion;

        if (succeeded) {
          coordinator.lastSucceededVersion = targetVersion;
        }
      }
    })();
    const guardedSyncLoop = syncLoop.catch(() => {
      coordinator.completedVersion = coordinator.requestedVersion;
      reportFailure();
    });

    coordinator.inFlight = guardedSyncLoop;
    void guardedSyncLoop.then(() => {
      if (coordinator.inFlight === guardedSyncLoop) {
        coordinator.inFlight = null;
      }

      if (
        isActive() &&
        coordinator.completedVersion < coordinator.requestedVersion
      ) {
        ensureSyncLoop();
      }
    });
  }

  while (
    isActive() &&
    coordinator.completedVersion < requestedVersion
  ) {
    ensureSyncLoop();

    if (!coordinator.inFlight) {
      break;
    }

    await coordinator.inFlight;
  }

  return coordinator.lastSucceededVersion >= requestedVersion;
}
