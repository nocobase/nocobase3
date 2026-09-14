import { ChildPageExample } from '@/components/child-page-example';

import { routeChildPageTopics } from './route-child-page-topics.js';

const topic = routeChildPageTopics.find((entry) => entry.id === 'quotation')!;

export default function RouteChildPageQuotationPage() {
  return <ChildPageExample topic={topic} />;
}
