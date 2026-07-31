interface MegurutoMarkProps {
  className?: string;
}

export function MegurutoMark({ className }: MegurutoMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="14" fill="#243C58" />
      <path
        fill="#FFFFFF"
        transform="translate(5 52) scale(0.054 -0.054)"
        d="M42 756C98 708 165 638 193 589L292 665C260 713 191 779 133 824ZM413 832C390 738 339 590 291 474C360 335 419 180 442 76L559 121C531 213 470 355 407 475C448 578 492 680 527 805ZM608 832C582 738 525 591 472 475C547 335 614 181 640 77L755 123C725 215 657 357 590 475C634 578 683 679 722 804ZM812 832C783 738 721 590 663 474C744 335 816 180 845 76L962 123C928 216 856 357 783 475C832 577 886 677 928 802ZM266 460H38V349H151V130C110 96 65 64 26 38L83 -81C134 -38 175 0 215 40C276 -38 356 -67 476 -72C598 -77 812 -75 936 -69C942 -35 960 20 974 48C835 36 597 34 477 39C375 43 304 72 266 139Z"
      />
    </svg>
  );
}
