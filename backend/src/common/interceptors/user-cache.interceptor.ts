import { CacheInterceptor } from '@nestjs/cache-manager';
import { ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class UserCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Default key is the URL
    const urlKey = super.trackBy(context) as string | undefined;
    
    // If no user, fallback to default (url)
    if (!user) {
      return urlKey;
    }

    if (!urlKey) return undefined;

    // Append userId to the cache key to isolate cache per user
    return `${user.id}:${urlKey}`;
  }
}
