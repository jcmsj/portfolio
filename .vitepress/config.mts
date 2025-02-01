import { defineConfig } from 'vitepress'
import tailwindcss from "@tailwindcss/vite";
// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "JCSJ",
  description: "I'm Jean Carlo San Juan, a developer based in the Philippines. I want to build web apps that improve people's lives using technologies like Vue, React, Laravel.",
  // https://vitepress.dev/guide/deploy#setting-a-public-base-path
  base: "/portfolio/",
  lastUpdated: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Contact', link: '/contact' },
    ],
    sidebar: [
      {
        // text: 'Examples',
        items: [
          { text: 'About', link: '/about' },
          { text: 'Contact', link: '/contact' },
          { text: 'Resume', link: 'https://rxresu.me/jcmsj/ojt-resume' },
          { text: 'Organizations', link: '/organizations' },
        ]
      },
      // {
      //   text: 'Projects',
        
      // }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/jcmsj' },
      { icon: 'linkedin', link: 'https://www.linkedin.com/in/jean-carlo-san-juan-a52093244/' },
      { icon: 'gmail', link: 'mailto:sanjuan.jeancarlo@gmail.com' },
      { icon: 'facebook', link: 'https://www.facebook.com/989.JcSanJuan' }
    ]
  },
  vite: {
    plugins: [tailwindcss(),],
  }
})
