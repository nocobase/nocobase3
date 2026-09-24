import { ChildPageExample } from '../shared.js';
import { routeChildPageTopics } from '../topics.js';

const topic = routeChildPageTopics.quotation;

export default function RouteChildPageQuotationPage() {
  return <ChildPageExample topic={topic} />;
}
