#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface RXNSafeAppend : NSObject
// Runs block in @try/@catch. Returns NO if any NSException was thrown.
// On NO the caller must stop writing and not touch the writer again.
+ (BOOL)try:(NS_NOESCAPE void (^)(void))block;
@end

NS_ASSUME_NONNULL_END
