import type { Metadata } from "next";
export const metadata: Metadata = { title: "Dragon Dawwa", description: "Knowledge with humility. A community for learning and reflection.", icons: {icon:"/assets/mark.svg"} };
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {return <html lang="en"><body>{children}</body></html>;}
