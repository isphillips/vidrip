#import "RXNSafeAppend.h"

@implementation RXNSafeAppend

+ (BOOL)try:(NS_NOESCAPE void (^)(void))block {
  @try {
    block();
    return YES;
  } @catch (NSException *) {
    return NO;
  }
}

@end
