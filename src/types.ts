export interface SteamApp {
  appid: number;
  name: string;
}

export interface StoreAppListResponse {
  response: {
    apps: SteamApp[];
    have_more_results?: boolean;
    last_appid?: number;
  };
}

export interface PriceOverview {
  currency: string;
  initial: number;
  final: number;
  discount_percent: number;
  initial_formatted: string;
  final_formatted: string;
}

export interface StoreData {
  type: string;
  name: string;
  steam_appid: number;
  required_age: number;
  is_free: boolean;
  controller_support?: string;
  detailed_description: string;
  about_the_game: string;
  short_description: string;
  supported_languages?: string;
  header_image: string;
  website: string | null;
  developers?: string[];
  publishers?: string[];
  price_overview?: PriceOverview;
  platforms: {
    windows: boolean;
    mac: boolean;
    linux: boolean;
  };
  metacritic?: {
    score: number;
    url: string;
  };
  categories?: { id: number; description: string }[];
  genres?: { id: string; description: string }[];
  screenshots?: { id: number; path_thumbnail: string; path_full: string }[];
  movies?: {
    id: number;
    name: string;
    thumbnail: string;
    webm?: { [key: string]: string };
    mp4?: { [key: string]: string };
  }[];
  recommendations?: { total: number };
  release_date?: {
    coming_soon: boolean;
    date: string;
  };
  pc_requirements?: { minimum?: string; recommended?: string } | [];
  mac_requirements?: { minimum?: string; recommended?: string } | [];
  linux_requirements?: { minimum?: string; recommended?: string } | [];
}

export interface StoreDetailsResponse {
  [appid: string]: {
    success: boolean;
    data?: StoreData;
  };
}

export interface OwnedGame {
  appid: number;
  name: string;
  playtime_forever: number;
  playtime_windows_forever?: number;
  playtime_mac_forever?: number;
  playtime_linux_forever?: number;
  playtime_2weeks?: number;
  img_icon_url?: string;
  rtime_last_played?: number;
}

export interface OwnedGamesResponse {
  response: {
    game_count: number;
    games: OwnedGame[];
  };
}

export interface RecentGame {
  appid: number;
  name: string;
  playtime_forever: number;
  playtime_2weeks: number;
  img_icon_url?: string;
}

export interface RecentGamesResponse {
  response: {
    total_count: number;
    games: RecentGame[];
  };
}

// ISteamUser/GetPlayerSummaries/v0002
export interface PlayerSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
  personastate: number; // 0=Offline, 1=Online, 2=Busy, 3=Away, 4=Snooze, 5=Looking to trade, 6=Looking to play
  communityvisibilitystate: number; // 1=Private, 3=Public
  profilestate?: number;
  lastlogoff?: number;
  commentpermission?: number;
  // Private fields (only if profile is public)
  realname?: string;
  primaryclanid?: string;
  timecreated?: number;
  gameid?: string;
  gameserverip?: string;
  gameextrainfo?: string;
  loccountrycode?: string;
  locstatecode?: string;
  loccityid?: number;
}

export interface PlayerSummariesResponse {
  response: {
    players: PlayerSummary[];
  };
}

// ISteamUser/GetFriendList/v0001
export interface Friend {
  steamid: string;
  relationship: string;
  friend_since: number;
}

export interface FriendListResponse {
  friendslist: {
    friends: Friend[];
  };
}

// ISteamUserStats/GetPlayerAchievements/v0001
export interface PlayerAchievement {
  apiname: string;
  achieved: number; // 0 or 1
  unlocktime: number;
  name?: string;
  description?: string;
}

export interface PlayerAchievementsResponse {
  playerstats: {
    steamID: string;
    gameName: string;
    achievements: PlayerAchievement[];
    success: boolean;
  };
}

// ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002
export interface GlobalAchievementPercentage {
  name: string;
  percent: number;
}

export interface GlobalAchievementPercentagesResponse {
  achievementpercentages: {
    achievements: GlobalAchievementPercentage[];
  };
}

// ISteamUserStats/GetNumberOfCurrentPlayers/v0001
export interface CurrentPlayersResponse {
  response: {
    player_count: number;
    result: number;
  };
}

// ISteamNews/GetNewsForApp/v0002
export interface NewsItem {
  gid: string;
  title: string;
  url: string;
  is_external_url: boolean;
  author: string;
  contents: string;
  feedlabel: string;
  date: number;
  feedname: string;
  feed_type: number;
  appid: number;
}

export interface NewsResponse {
  appnews: {
    appid: number;
    newsitems: NewsItem[];
  };
}
