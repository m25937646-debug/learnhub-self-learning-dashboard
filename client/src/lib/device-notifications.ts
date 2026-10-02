export type DeviceNotificationStatus = "unsupported" | "default" | "denied" | "granted";

export function getDeviceNotificationStatus(): DeviceNotificationStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function requestDeviceNotifications(): Promise<DeviceNotificationStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  return Notification.permission;
}

export async function notifyDevice(
  title: string,
  options: NotificationOptions & { url?: string } = {},
): Promise<boolean> {
  if (getDeviceNotificationStatus() !== "granted") return false;
  const { url = "/", ...notificationOptions } = options;
  const registration = await getRegistration();
  try {
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        ...notificationOptions,
        icon: "/icons/app-icon-192.png",
        badge: "/icons/app-icon-192.png",
        dir: "rtl",
        lang: "ar",
        data: { ...(notificationOptions.data as Record<string, unknown> | undefined), url },
      });
      return true;
    }
    new Notification(title, notificationOptions);
    return true;
  } catch {
    return false;
  }
}

export async function sendNotificationTest(): Promise<DeviceNotificationStatus> {
  const status = await requestDeviceNotifications();
  if (status === "granted") {
    await notifyDevice("LearnHub جاهز للتنبيه", {
      body: "ستصلك تنبيهات المنبهات والمواعيد من هذا الجهاز.",
      tag: "learnhub-notification-test",
      url: "/?notification=test",
    });
  }
  return status;
}
