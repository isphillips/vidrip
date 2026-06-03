// Recording implementation moved to ReaxnScreenRecorder.m (pure ObjC).
// @try/@catch around appendSampleBuffer requires ObjC — NSExceptions thrown
// inside Swift closures escape catch blocks because Swift lacks ObjC exception
// landing pads in its stack frames.
