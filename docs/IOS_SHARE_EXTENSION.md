# iOS "Share to Vidrip" — Share Extension (build on Mac/Xcode)

This makes Vidrip appear in the iOS share sheet when someone shares a YouTube/TikTok
link (Safari, YouTube app, etc.). It reuses the **same** JS pipeline as Android — the
extension just opens `reaxn://share?text=<url>` and the app's existing
`RootNavigator.handleDeepLink` does the rest. **No JS/TS changes are needed on iOS.**

> Outbound sharing (the ↗ button) already works on iOS — RN's built-in `Share` API is
> cross-platform. Nothing to do there.

## Prerequisites (verify once)
1. The main app already registers the `reaxn` URL scheme. Confirm in
   `ios/Vidrip/Info.plist` there is a `CFBundleURLTypes` entry with
   `CFBundleURLSchemes` containing `reaxn`. (It's used for OAuth, so it should be there.)
2. Open `ios/Vidrip.xcworkspace` (the **workspace**, not the project) in Xcode.

## Step 1 — Add the Share Extension target
1. Xcode → **File ▸ New ▸ Target… ▸ Share Extension**.
2. Product name: `ShareExtension`. Language: **Swift**. Finish.
   - When prompted "Activate scheme?", click **Activate**.
3. Set the extension's **Deployment Target** to match the app (e.g. iOS 13+).
4. Signing: select your team for the new target (same as the app).

## Step 2 — App Group (so the extension can hand off, and for future shared storage)
1. Select the **app** target → Signing & Capabilities → **+ Capability ▸ App Groups** →
   add `group.com.reaxn.share`.
2. Select the **ShareExtension** target → add the **same** App Group `group.com.reaxn.share`.

(We don't strictly need the App Group for the openURL approach below, but add it now —
it's required if you later switch to the shared-container handoff, and it's free.)

## Step 3 — Replace the generated ShareViewController
Delete the storyboard-based UI the template created and replace
`ShareExtension/ShareViewController.swift` with this. It extracts the shared URL/text,
builds `reaxn://share?text=…`, opens the host app, and finishes — no UI.

```swift
import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    handleShare()
  }

  private func handleShare() {
    guard
      let item = extensionContext?.inputItems.first as? NSExtensionItem,
      let providers = item.attachments
    else { return complete() }

    // Prefer a URL attachment; fall back to plain text (which may contain a URL).
    let urlType = UTType.url.identifier        // "public.url"
    let textType = UTType.plainText.identifier  // "public.plain-text"

    if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) }) {
      p.loadItem(forTypeIdentifier: urlType, options: nil) { [weak self] data, _ in
        let urlString = (data as? URL)?.absoluteString ?? (data as? String) ?? ""
        self?.openHost(with: urlString)
      }
    } else if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(textType) }) {
      p.loadItem(forTypeIdentifier: textType, options: nil) { [weak self] data, _ in
        self?.openHost(with: (data as? String) ?? "")
      }
    } else {
      complete()
    }
  }

  private func openHost(with text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty,
          let encoded = trimmed.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
          let url = URL(string: "reaxn://share?text=\(encoded)")
    else { return complete() }

    // Open the host app from an extension via the responder chain (Apple has no
    // public API for this from a Share Extension, but this is the standard trick).
    var responder: UIResponder? = self
    let selector = sel_registerName("openURL:")
    while let r = responder {
      if r.responds(to: selector) {
        _ = r.perform(selector, with: url)
        break
      }
      responder = r.next
    }
    complete()
  }

  private func complete() {
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }
}
```

If Xcode generated a `MainInterface.storyboard` for the extension, delete it and remove
the `NSExtensionMainStoryboard` key from the extension's Info.plist (Step 4 uses
`NSExtensionPrincipalClass` instead).

## Step 4 — ShareExtension Info.plist
Set the extension's `Info.plist` `NSExtension` dict so it activates for URLs/text and
uses our controller (no storyboard):

```xml
<key>NSExtension</key>
<dict>
  <key>NSExtensionPointIdentifier</key>
  <string>com.apple.share-services</string>
  <key>NSExtensionPrincipalClass</key>
  <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
  <key>NSExtensionAttributes</key>
  <dict>
    <key>NSExtensionActivationRule</key>
    <dict>
      <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
      <integer>1</integer>
      <key>NSExtensionActivationSupportsText</key>
      <true/>
    </dict>
  </dict>
</dict>
```

## Step 5 — Build & test
1. Select the **ShareExtension** scheme → Run → choose **Safari** (or YouTube) as the app
   to run into. Or just run the app, then use the share sheet anywhere.
2. In Safari, open any YouTube video → **Share** → you should see **Vidrip**.
3. Tap it → Vidrip launches → lands on the **Share** tab in Paste mode with the URL
   pre-filled and the 3-min validation running. (This is the shared `reaxn://share`
   handler — identical to Android.)

## Why no JS changes
`RootNavigator.handleDeepLink` already handles `reaxn://share?text=…` (added for Android).
The iOS extension produces the exact same deep link, so the same code drives both.

## Troubleshooting
- **Vidrip not in the share sheet:** check the `NSExtensionActivationRule` (Step 4) and
  that the extension target is embedded in the app (General ▸ Frameworks, Libraries &
  Embedded Content of the app target should list the extension).
- **Taps but app doesn't open:** confirm the `reaxn` URL scheme is registered in the
  **app's** Info.plist (Prerequisite 1). The responder-chain `openURL:` trick requires it.
- **App opens but field isn't pre-filled:** verify the link reached JS — add a log in
  `handleDeepLink`; the `reaxn://share` branch should fire.
