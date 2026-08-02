import os
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "screenshots" / os.environ.get("VISUAL_AUDIT_DIR", "audit")
OUTPUT.mkdir(parents=True, exist_ok=True)
BASE_URL = os.environ.get("VISUAL_AUDIT_URL", "http://127.0.0.1:4173")


def prepare_camera(page):
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.locator("#previewPlaceholder").wait_for(state="hidden")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        args=[
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
        ],
    )

    desktop = browser.new_page(viewport={"width": 1440, "height": 900})
    prepare_camera(desktop)
    capture_bar_box = desktop.locator(".desktop-capture-bar").bounding_box()
    status_bar_box = desktop.locator(".preview-status-bar").bounding_box()
    assert capture_bar_box and status_bar_box
    assert status_bar_box["y"] >= capture_bar_box["y"] + capture_bar_box["height"]
    for selector in (".capture-timer-field", ".capture-actions"):
        box = desktop.locator(selector).bounding_box()
        assert box
        assert abs(
            (box["y"] + box["height"] / 2)
            - (capture_bar_box["y"] + capture_bar_box["height"] / 2)
        ) <= 1
    desktop.screenshot(path=OUTPUT / "desktop-running.png")

    desktop.locator("#chkBlobTracking").check()
    desktop.locator("#chkFaceDetection").check()
    desktop.locator("#colorPickSection").wait_for(state="visible")
    desktop.locator("#faceQuickControls").wait_for(state="visible")
    detector_box = desktop.locator(".detector-unit").first.bounding_box()
    color_controls_box = desktop.locator("#colorPickSection").bounding_box()
    face_controls_box = desktop.locator("#faceQuickControls").bounding_box()
    assert detector_box and color_controls_box and face_controls_box
    assert abs(color_controls_box["x"] - detector_box["x"]) <= 1
    assert abs(face_controls_box["x"] - detector_box["x"]) <= 1
    desktop.screenshot(path=OUTPUT / "desktop-detectors-open.png")
    desktop.locator("#chkBlobTracking").uncheck()
    desktop.locator("#chkFaceDetection").uncheck()

    desktop.locator("#btnToggleAdvancedOptions").click()
    desktop.locator("#advancedOptions").wait_for(state="visible")
    desktop.screenshot(path=OUTPUT / "desktop-advanced.png")

    desktop.get_by_role("tab", name="Video").click()
    desktop.locator("#videoTimeline").wait_for(state="visible")
    desktop.screenshot(path=OUTPUT / "desktop-video-editor.png")

    desktop.get_by_role("tab", name="Webcam").click()
    desktop.locator("#previewPlaceholder").wait_for(state="hidden")
    desktop.locator("#btnTakePhoto").click()
    desktop.locator("#capturePreviewModal").wait_for(state="visible")
    desktop.screenshot(path=OUTPUT / "desktop-photo-preview.png")
    desktop.locator("#btnDiscardCapture").click()
    desktop.close()

    mobile = browser.new_page(
        viewport={"width": 390, "height": 844},
        is_mobile=True,
    )
    prepare_camera(mobile)
    mobile.screenshot(path=OUTPUT / "mobile-running.png")
    mobile.locator("#btnMobileEffectsDock").click()
    mobile.locator("#mobileFxPanel").wait_for(state="visible")
    mobile.wait_for_timeout(180)
    mobile_panel_box = mobile.locator("#mobileFxPanel").bounding_box()
    mobile_dock_box = mobile.locator(".mobile-hud-bottom").bounding_box()
    assert mobile_panel_box and mobile_dock_box
    assert (
        mobile_panel_box["y"] + mobile_panel_box["height"]
        <= mobile_dock_box["y"] + 1
    )
    for selector in (
        "#btnMobileEffectsDock",
        "#btnMobileTakePhoto",
        "#btnMobileRecord",
    ):
        box = mobile.locator(selector).bounding_box()
        assert box
        assert box["y"] >= mobile_dock_box["y"]
        assert box["y"] + box["height"] <= (
            mobile_dock_box["y"] + mobile_dock_box["height"]
        )
    mobile.screenshot(path=OUTPUT / "mobile-adjustments.png")
    mobile.locator("#btnMobileFxClose").click()
    mobile.locator("#btnMobileTakePhoto").click()
    mobile.locator("#capturePreviewModal").wait_for(state="visible")
    mobile.screenshot(path=OUTPUT / "mobile-photo-preview.png")
    mobile.locator("#btnDiscardCapture").click()
    mobile.wait_for_timeout(250)
    mobile.evaluate("document.querySelector('#btnToggleCamera').click()")
    mobile.locator("#cameraStateTitle").wait_for(state="visible")
    mobile.screenshot(path=OUTPUT / "mobile-off.png")
    mobile.close()

    browser.close()
