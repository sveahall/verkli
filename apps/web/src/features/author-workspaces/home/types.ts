export type DashboardStats = {
  sales: number;
  readers: number;
  subscribers: number;
  comments: number;
  reviews: number;
};

export type DashboardBook = {
  id: string;
  title: string;
  status: string;
  readers: number;
  updatedAt: string;
  coverUrl: string | null;
};

export type DashboardActivity = {
  id: string;
  type: "translation" | "audiobook" | "publish";
  label: string;
  detail: string;
  timestamp: string;
};

export type CountrySale = {
  country: string;
  share: string;
};
