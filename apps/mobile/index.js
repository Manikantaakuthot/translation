import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// and also ensures that whether you load in Expo Go or in a native build,
// the root component is rendered correctly.
registerRootComponent(App);
