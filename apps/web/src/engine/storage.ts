export type ZoomSetting = 'auto' | 2 | 3 | 4;

export class StorageManager {
  private static readonly ZOOM_KEY = 'lofi_zoom';

  public static getZoom(): ZoomSetting {
    if (typeof localStorage === 'undefined') {
      return 'auto';
    }
    try {
      const val = localStorage.getItem(this.ZOOM_KEY);
      if (val === '2' || val === '3' || val === '4') {
        return parseInt(val, 10) as 2 | 3 | 4;
      }
      return 'auto';
    } catch {
      return 'auto';
    }
  }

  public static setZoom(zoom: ZoomSetting): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      if (zoom === 'auto') {
        localStorage.removeItem(this.ZOOM_KEY);
      } else {
        localStorage.setItem(this.ZOOM_KEY, String(zoom));
      }
    } catch {
      // Ignore storage errors (e.g. private browsing or quota exceeded)
    }
  }
}
