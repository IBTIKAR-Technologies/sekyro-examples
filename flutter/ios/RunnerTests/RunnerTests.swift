import XCTest

final class RunnerTests: XCTestCase {
  // The SDK cannot open the camera without its usage string.
  func testTheCameraUsageStringIsDeclared() {
    XCTAssertNotNil(Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription"))
  }
}
