import UIKit
import UniformTypeIdentifiers

// ════════════════════════════════════════════════════════════════════════════════════════════
//  Vidrip Share Extension — the iOS counterpart to Android's MainActivity.rewriteShareIntent.
//
//  iOS apps can't appear in the system Share Sheet from Info.plist alone; they need an app-extension
//  target (NSExtensionPointIdentifier = com.apple.share-services). When the user shares a link/text
//  into "Vidrip", this controller pulls the shared URL (or text containing one) and re-opens the host
//  app with `vidrip://share?text=<url-encoded>` — the SAME deep link Android produces. RootNavigator's
//  handleDeepLink() then parses it, sets pendingUrl, and ShareHomeScreen jumps straight to the paste
//  preview. No App Group needed: the payload rides in the URL.
// ════════════════════════════════════════════════════════════════════════════════════════════

class ShareViewController: UIViewController {

  override func viewDidLoad() {
    super.viewDidLoad()
    // Dusk backdrop instead of the default white flash while we bounce to the app.
    view.backgroundColor = UIColor(red: 0.098, green: 0.039, blue: 0.2, alpha: 1)
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    extractSharedLink()
  }

  private func extractSharedLink() {
    guard
      let item = extensionContext?.inputItems.first as? NSExtensionItem,
      let providers = item.attachments
    else { return finish() }

    let urlType = UTType.url.identifier        // "public.url"
    let textType = UTType.plainText.identifier // "public.plain-text"

    // Prefer an explicit URL attachment (Safari / YouTube / TikTok "Share → Vidrip").
    if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(urlType) }) {
      provider.loadItem(forTypeIdentifier: urlType, options: nil) { [weak self] data, _ in
        self?.route((data as? URL)?.absoluteString ?? (data as? String))
      }
      return
    }

    // Otherwise fall back to shared plain text (often "caption https://…").
    if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(textType) }) {
      provider.loadItem(forTypeIdentifier: textType, options: nil) { [weak self] data, _ in
        self?.route(data as? String)
      }
      return
    }

    finish()
  }

  // Build the vidrip://share?text=… deep link and bounce to the host app (on the main thread).
  private func route(_ shared: String?) {
    guard let shared = shared, !shared.isEmpty else { return finish() }
    var allowed = CharacterSet.urlQueryAllowed
    allowed.remove(charactersIn: "&?=+#") // keep the query parseable on the JS side
    let encoded = shared.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
    guard let url = URL(string: "vidrip://share?text=\(encoded)") else { return finish() }
    DispatchQueue.main.async { [weak self] in self?.openHostApp(url) }
  }

  private func openHostApp(_ url: URL) {
    // Primary: NSExtensionContext.open — the reliable way for a share extension to launch the
    // containing app's URL scheme (iOS 13+). Complete the request only AFTER the open resolves,
    // so the share UI tearing down doesn't cancel the hand-off.
    guard let ctx = extensionContext else { return finish() }
    ctx.open(url) { [weak self] opened in
      if !opened { self?.openViaResponderChain(url) }
      self?.finish()
    }
  }

  // Fallback: walk the responder chain to a UIApplication and invoke openURL: (older trick).
  private func openViaResponderChain(_ url: URL) {
    var responder: UIResponder? = self
    let selector = sel_registerName("openURL:")
    while let r = responder {
      if r.responds(to: selector) { _ = r.perform(selector, with: url); return }
      responder = r.next
    }
  }

  private func finish() {
    DispatchQueue.main.async { [weak self] in
      self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
  }
}
