import type { OnboardingRole } from '@barbershop/shared'

/**
 * SVG portraits based sa original sketch ni Erick. Magkahiwalay ang head at
 * pupils groups para puwedeng sumunod sa cursor nang hindi nire-render ang React.
 */
export function RoleAvatar({ role }: { role: OnboardingRole }) {
  return (
    <span className={`role-avatar-frame role-avatar-${role}`} aria-hidden="true">
      {role === 'barber' && <BarberAvatar />}
      {role === 'shop_owner' && <ShopOwnerAvatar />}
      {role === 'customer' && <CustomerAvatar />}
    </span>
  )
}

function BarberAvatar() {
  return (
    <svg className="role-avatar-svg" viewBox="0 0 220 190">
      <path className="avatar-backdrop" d="M25 176 Q34 128 73 119 Q108 107 147 121 Q187 134 195 176 Z" />
      <g className="role-avatar-head-track">
        <path className="avatar-ear" d="M52 75 Q38 67 34 80 Q32 96 51 102" />
        <path className="avatar-ear" d="M168 75 Q182 67 186 81 Q187 96 168 102" />
        <path className="avatar-skin" d="M52 51 Q61 22 110 21 Q159 22 168 51 L166 91 Q161 124 110 131 Q59 124 54 91 Z" />
        <path className="avatar-hair avatar-hair-fill" d="M50 70 Q40 51 52 38 Q50 22 67 19 Q77 6 93 14 Q107 2 121 13 Q139 5 147 20 Q165 22 164 38 Q177 51 167 73 L154 67 Q151 51 140 43 Q126 55 106 51 Q85 55 69 43 Q57 51 57 69 Z" />
        <path className="avatar-brow" d="M73 76 Q83 71 91 76 M129 76 Q138 71 147 76" />
        <g className="role-avatar-eye-track">
          <circle className="avatar-pupil" cx="83" cy="85" r="4.6" />
          <circle className="avatar-pupil" cx="138" cy="85" r="4.6" />
        </g>
        <path className="avatar-nose" d="M108 82 Q104 96 111 99 Q116 100 119 97" />
        <path className="avatar-mustache avatar-hair-fill" d="M109 105 Q96 96 82 105 Q91 118 109 111 Q128 118 139 105 Q124 96 109 105 Z" />
        <path className="avatar-mouth" d="M98 118 Q110 126 123 118" />
      </g>
      <path className="avatar-neck" d="M83 122 L82 139 Q109 152 138 139 L137 122" />
      <path className="avatar-body avatar-barber-cape" d="M24 183 Q31 145 69 132 Q108 155 150 132 Q188 146 196 183" />
      <path className="avatar-collar" d="M69 132 Q109 156 150 132" />
      <g className="avatar-cape-pattern">
        <path d="M48 151 l-6 7 M66 145 l-6 8 M84 151 l-6 8 M103 146 l-6 8 M123 151 l-6 8 M143 145 l-6 8 M162 152 l-6 8 M181 148 l-6 8" />
        <path d="M39 169 l-6 8 M58 164 l-6 8 M78 171 l-6 8 M98 164 l-6 8 M119 171 l-6 8 M139 165 l-6 8 M160 172 l-6 8 M181 166 l-6 8" />
      </g>
    </svg>
  )
}

function ShopOwnerAvatar() {
  return (
    <svg className="role-avatar-svg" viewBox="0 0 220 190">
      <path className="avatar-backdrop" d="M27 178 Q36 137 76 125 Q110 113 148 126 Q187 140 194 178 Z" />
      <g className="role-avatar-head-track">
        <path className="avatar-ear" d="M53 76 Q38 69 37 84 Q38 99 54 103" />
        <path className="avatar-ear" d="M167 76 Q182 69 183 84 Q182 99 166 103" />
        <path className="avatar-skin" d="M53 48 Q66 20 110 19 Q154 20 167 49 L164 96 Q156 126 110 132 Q64 126 56 96 Z" />
        <path className="avatar-owner-hair" d="M51 65 Q35 61 42 46 Q31 33 45 25 Q43 9 59 10 Q66 -3 80 7 Q91 -4 103 7 Q116 -5 127 8 Q142 0 148 14 Q164 12 164 28 Q178 35 170 49 Q178 62 164 69 L154 58 Q147 64 140 57 Q129 64 120 55 Q107 65 96 55 Q84 64 75 55 Q64 66 51 65 Z" />
        <path className="avatar-brow" d="M70 76 Q80 70 91 76 M128 76 Q139 70 150 76" />
        <g className="avatar-glasses">
          <rect x="61" y="70" width="39" height="29" rx="8" />
          <rect x="121" y="70" width="39" height="29" rx="8" />
          <path d="M100 82 Q110 77 121 82 M61 79 L52 77 M160 79 L169 77" />
        </g>
        <g className="role-avatar-eye-track">
          <circle className="avatar-pupil" cx="81" cy="84" r="4.5" />
          <circle className="avatar-pupil" cx="140" cy="84" r="4.5" />
        </g>
        <path className="avatar-nose" d="M108 84 Q104 98 111 100 Q117 101 120 97" />
        <path className="avatar-mouth" d="M91 109 Q110 126 130 108" />
      </g>
      <path className="avatar-neck" d="M84 124 L82 140 L110 156 L139 140 L136 123" />
      <path className="avatar-body avatar-owner-shirt" d="M27 184 Q34 145 75 132 L110 155 L146 132 Q186 145 194 184 Z" />
      <path className="avatar-owner-collar" d="M75 132 L98 148 L110 155 L92 169 Z M146 132 L122 148 L110 155 L129 169 Z" />
      <circle className="avatar-shirt-button" cx="110" cy="164" r="3.4" />
      <circle className="avatar-shirt-button" cx="110" cy="178" r="3.4" />
      <path className="avatar-pocket" d="M146 153 H180 L178 181 H147 Z M146 153 H180" />
    </svg>
  )
}

function CustomerAvatar() {
  return (
    <svg className="role-avatar-svg" viewBox="0 0 220 190">
      <path className="avatar-backdrop" d="M26 178 Q35 137 76 124 Q109 113 147 125 Q188 139 195 178 Z" />
      <g className="role-avatar-head-track">
        <path className="avatar-ear" d="M53 75 Q39 67 36 82 Q36 98 54 102" />
        <path className="avatar-ear" d="M167 75 Q181 67 184 82 Q184 98 166 102" />
        <path className="avatar-hair avatar-hair-fill avatar-customer-backhair" d="M52 69 Q45 36 66 20 Q85 4 109 11 Q136 3 157 25 Q174 45 166 79 L158 124 Q145 137 131 132 L89 133 Q72 139 58 122 Z" />
        <path className="avatar-skin" d="M56 58 Q69 30 108 25 Q151 29 164 58 L162 94 Q155 125 110 132 Q65 125 58 94 Z" />
        <path className="avatar-hair avatar-hair-fill avatar-customer-fringe" d="M54 65 Q50 33 75 19 Q98 4 111 17 Q129 3 153 24 Q171 41 164 66 Q147 62 129 41 Q116 58 91 66 Q75 70 54 65 Z" />
        <path className="avatar-brow" d="M72 76 Q82 70 91 76 M129 76 Q138 70 148 76" />
        <g className="role-avatar-eye-track">
          <circle className="avatar-pupil" cx="82" cy="85" r="4.4" />
          <circle className="avatar-pupil" cx="139" cy="85" r="4.4" />
        </g>
        <path className="avatar-nose" d="M108 83 Q104 98 111 101 Q117 101 120 97" />
        <path className="avatar-mouth" d="M91 109 Q110 127 130 108" />
      </g>
      <path className="avatar-neck" d="M84 124 L82 141 Q110 155 138 141 L136 123" />
      <path className="avatar-body avatar-customer-shirt" d="M25 184 Q33 145 74 132 Q110 156 147 132 Q188 145 196 184 Z" />
      <path className="avatar-collar" d="M74 132 Q110 156 147 132" />
      <g className="avatar-plaid">
        <path d="M50 142 V184 M77 136 V184 M109 151 V184 M142 136 V184 M170 143 V184" />
        <path d="M35 151 H185 M29 168 H191" />
      </g>
    </svg>
  )
}
