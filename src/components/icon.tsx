const paths: Record<string,string> = {
  check: 'M5 12l4 4L19 6',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  clock: 'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  students:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  teachers:'M3 4h18v12H12 M8 21v-3a4 4 0 0 0-8 0 M8 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M13 8h5 M13 11h3',
  classes:'M3 3h7l2 2 2-2h7v17h-7l-2 2-2-2H3z M12 5v17',
  attendance:'M8 2v4 M16 2v4 M3 9h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M8 15l3 3 5-6',
  notices:'M3 10v4h4l12 5V5L7 10H3 M7 14l2 7h4l-3-6 M22 9v6',
  plus:'M12 5v14 M5 12h14', search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow:'M5 12h14 M13 6l6 6-6 6', chevron:'M9 5l7 7-7 7', close:'M6 6l12 12 M6 18L18 6',
  menu:'M3 6h18 M3 12h18 M3 18h18', mail:'M3 5h18v14H3z M3 5l9 8 9-8',
  edit:'M15 5l4 4 M4 16l12-12a2.8 2.8 0 0 1 4 4L8 20H4z', trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
  info:'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  shield:'M12 2l9 4v6c0 6-9 10-9 10S3 18 3 12V6z M8 12l3 3 5-6',
};
export function Icon({name,size=20}:{name:string;size?:number}) {return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d={paths[name]??paths.classes}/></svg>}
