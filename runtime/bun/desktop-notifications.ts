type CompletionNotification = {
  title: string;
  body?: string;
  subtitle?: string;
};

let notificationUtilsPromise: Promise<{
  showNotification(args: {
    title: string;
    body?: string;
    subtitle?: string;
    silent?: boolean;
  }): unknown;
} | null> | null = null;

async function loadNotificationUtils() {
  if (!notificationUtilsPromise) {
    notificationUtilsPromise = import('electrobun/bun')
      .then((module) => module.Utils)
      .catch(() => null);
  }

  return notificationUtilsPromise;
}

export function notifyTaskCompleted(notification: CompletionNotification) {
  void loadNotificationUtils()
    .then((utils) => {
      if (!utils) {
        return;
      }

      try {
        utils.showNotification({
          title: notification.title,
          body: notification.body,
          subtitle: notification.subtitle,
          silent: false,
        });
      } catch {
        // Notifications are best-effort and must not affect the underlying task.
      }
    })
    .catch(() => {
      // Notifications are best-effort and must not affect the underlying task.
    });
}
