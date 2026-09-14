import { ChildPageExample } from './shared.js';
import { routeChildPageTopics } from './topics.js';

const topic = routeChildPageTopics.find((entry) => entry.id === 'onboarding')!;

export default function RouteChildPageOnboardingPage() {
  return <ChildPageExample topic={topic} />;
}
