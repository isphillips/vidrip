declare module 'react-native-vector-icons/Ionicons' {
  import { Component } from 'react';
  interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: object;
  }
  class Ionicons extends Component<IconProps> {}
  export default Ionicons;
}
