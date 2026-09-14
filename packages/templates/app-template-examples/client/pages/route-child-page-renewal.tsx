import { ChildPageExample } from '@/components/child-page-example';

import { routeChildPageTopics } from './route-child-page-topics.js';

const topic = routeChildPageTopics.find((entry) => entry.id === 'renewal')!;

export default function RouteChildPageRenewalPage() {
  return <ChildPageExample topic={topic} />;
}
