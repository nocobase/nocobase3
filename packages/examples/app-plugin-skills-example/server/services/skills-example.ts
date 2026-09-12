import type { AppNoticeData, AppNoticeService } from '../tokens.js';

export class DefaultAppNoticeService implements AppNoticeService {
  public getDefaultNotice(): AppNoticeData {
    return {
      description: 'This notice was provided by a NocoBase plugin.',
      title: 'Plugin Skills are working',
      tone: 'success',
    };
  }
}
