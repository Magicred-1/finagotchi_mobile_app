declare module 'react-native-gif' {
    import { Component } from 'react';
    import { ImageProps, ImageStyle } from 'react-native';

    export default class GifImage extends Component<ImageProps & { style?: ImageStyle }> {}
}
