export interface AppNavigationItem {
  readonly key: string;
  readonly label: string;
  readonly route: string;
}

export const HOME_NAVIGATION_ITEM: AppNavigationItem = Object.freeze({
  key: 'home',
  label: 'Home',
  route: '/',
});
