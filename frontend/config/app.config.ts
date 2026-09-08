type AppPath = `/${string}`;

type AppConfig = {
  name: string;

  auth: {
    enabled: boolean;
  };

  layout: {
    variant: "plain" | "menu";
  };

  routes: {
    home: AppPath;
    login: AppPath;
  };
};

export const appConfig: AppConfig = {
  name: "Application Template",

  auth: {
    enabled: false,
  },

  layout: {
    variant: 'menu',
  },

  routes: {
    home: "/dashboard",
    login: "/login",
  },
};