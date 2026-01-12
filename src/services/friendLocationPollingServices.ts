// src/services/friendLocationPollingService.ts
// ============================================
// FRIEND LOCATION POLLING SERVICE (IMPROVED)
// ============================================
// OPTIMIZED VERSION: Uses friends data from SubscriptionContext
// instead of fetching from database on every poll
// - More efficient (no duplicate network calls)
// - Faster (data already in memory)
// - Simpler (leverages existing subscription system)

export interface FriendLocation {
  id: string;
  latitude: number;
  longitude: number;
  locationUpdatedAt: string;
  isLocationSharing: boolean;
  username?: string;
}

// Simplified - just extracts location data from friend objects
export interface Friend {
  id: string;
  username?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationUpdatedAt?: string | null;
  isLocationSharing?: boolean;
}

export class FriendLocationPollingService {
  private static instance: FriendLocationPollingService;
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling = false;
  private onUpdate: ((locations: FriendLocation[]) => void) | null = null;
  private getFriendsCallback: (() => Friend[]) | null = null;
  private lastPollTime = 0;

  static getInstance(): FriendLocationPollingService {
    if (!FriendLocationPollingService.instance) {
      FriendLocationPollingService.instance = new FriendLocationPollingService();
    }
    return FriendLocationPollingService.instance;
  }

  /**
   * Start polling for friend locations
   * @param getFriends - Callback that returns current friends array from context
   * @param onUpdate - Callback when locations update
   * @param intervalMs - Polling interval (default 3000ms = 3 seconds)
   */
  startPolling(
    getFriends: () => Friend[],
    onUpdate: (locations: FriendLocation[]) => void,
    intervalMs: number = 3000
  ) {
    if (this.isPolling) {
      console.log('⚠️ Friend location polling already active');
      return;
    }

    this.getFriendsCallback = getFriends;
    this.onUpdate = onUpdate;
    this.isPolling = true;

    console.log(`🔄 Starting friend location polling (${intervalMs}ms interval)`);

    // Poll immediately for instant feedback
    this.pollFriendLocations();

    // Then poll on interval
    this.pollInterval = setInterval(() => {
      this.pollFriendLocations();
    }, intervalMs);
  }

  /**
   * Extract location data from friends array
   * No network calls - just processes in-memory data!
   */
  private pollFriendLocations() {
    const pollStartTime = Date.now();

    try {
      // Get current friends from context (no network call!)
      const friends = this.getFriendsCallback?.() || [];

      // Filter to only friends with valid locations who are sharing
      const friendLocations: FriendLocation[] = friends
        .filter(f =>
          f.latitude != null &&
          f.longitude != null &&
          f.isLocationSharing !== false  // Include if true or undefined (default true)
        )
        .map(f => ({
          id: f.id,
          latitude: f.latitude!,
          longitude: f.longitude!,
          locationUpdatedAt: f.locationUpdatedAt || '',
          isLocationSharing: f.isLocationSharing ?? true,
          username: f.username,
        }));

      // Notify callback with updated locations
      this.onUpdate?.(friendLocations);

      // Track success
      this.lastPollTime = Date.now();

      const pollDuration = Date.now() - pollStartTime;
      console.log(`✅ Polled ${friendLocations.length} friend location(s) in ${pollDuration}ms (from context)`);

    } catch (error) {
      console.error('❌ Error processing friend locations:', error);
    }
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isPolling = false;
    this.onUpdate = null;
    this.getFriendsCallback = null;
    console.log('🛑 Friend location polling stopped');
  }

  /**
   * Check if polling is active
   */
  isActive(): boolean {
    return this.isPolling;
  }

  /**
   * Get time since last successful poll
   */
  getTimeSinceLastPoll(): number {
    return this.lastPollTime ? Date.now() - this.lastPollTime : -1;
  }
}