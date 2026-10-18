import { mount } from 'svelte';
import App from './App.svelte';
import 'katex/dist/katex.min.css';
import 'markdown-it-texmath/css/texmath.css';
import 'highlight.js/styles/atom-one-dark.min.css';
import './style.css';
mount(App, { target: document.getElementById('app')! });
