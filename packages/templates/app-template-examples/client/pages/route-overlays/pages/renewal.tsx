import { ChildPageExample } from './shared.js';
import { routeChildPageTopics } from './topics.js';

const topic = routeChildPageTopics.renewal;

export default function RouteChildPageRenewalPage() {
  return <ChildPageExample topic={topic} />;
}
