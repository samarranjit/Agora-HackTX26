import './global.css';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ForestJourney from './src/ui/ForestJourney.js';
import { ScreenSizeContext } from './src/ui/theme.js';

export default function App() {
  const [size, setSize] = useState(null);
  useEffect(() => {
    // app.json already requests landscape; locking here also covers Expo Go and iPad.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    if (Platform.OS === 'android') NavigationBar.setVisibilityAsync('hidden').catch(() => {});
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#273d3e' }} onLayout={(event) => {
      const { width, height } = event.nativeEvent.layout;
      setSize((old) => (old && old.width === width && old.height === height ? old : { width, height }));
    }}>
      <SafeAreaProvider>
        <ScreenSizeContext.Provider value={size}>
          <StatusBar hidden style="light" />
          <ForestJourney />
        </ScreenSizeContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
