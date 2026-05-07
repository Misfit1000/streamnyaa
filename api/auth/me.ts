import { fetchSupabaseUser, isAdminEmail } from '../../server/adminAuth';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const user = await fetchSupabaseUser(token);
    if (!user?.email) return res.status(401).json({ error: 'Invalid session' });

    const isAdmin = await isAdminEmail(user.email);
    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      },
      isAdmin,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to verify session' });
  }
}
