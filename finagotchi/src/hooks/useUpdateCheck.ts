import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import * as Updates from 'expo-updates';

const UPDATE_PROMPT_TITLE = 'Update available';
const UPDATE_PROMPT_MESSAGE =
  'A new version of the app is available. Update now?';

/**
 * Checks for an EAS Update on startup and each time the app returns to the
 * foreground. Prompts the user to download and reload if an update is found.
 *
 * Skips checks in development mode and under Expo Go where `expo-updates` is
 * not embedded, so the module can be imported safely at the top level.
 */
export function useUpdateCheck() {
  const isCheckingRef = useRef(false);

  useEffect(() => {
    // Skip checks in local dev / Expo Go clients where expo-updates is not
    // enabled and cannot fetch remote updates.
    if (__DEV__ || !Updates.isEnabled) {
      return;
    }

    const checkForUpdate = async () => {
      if (isCheckingRef.current) {
        return;
      }

      try {
        isCheckingRef.current = true;
        const result = await Updates.checkForUpdateAsync();

        if (!result.isAvailable) {
          return;
        }

        Alert.alert(UPDATE_PROMPT_TITLE, UPDATE_PROMPT_MESSAGE, [
          {
            text: 'Later',
            style: 'cancel',
          },
          {
            text: 'Update',
            onPress: async () => {
              try {
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync();
              } catch {
                // Silently ignore fetch/reload errors so the app continues
                // running; the user can be prompted again on next foreground.
              }
            },
            style: 'default',
          },
        ]);
      } catch {
        // Silently ignore check errors to avoid disrupting the UX.
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Check on initial mount.
    void checkForUpdate();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        void checkForUpdate();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
