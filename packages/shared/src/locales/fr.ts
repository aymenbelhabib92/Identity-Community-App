/**
 * French for the texts produced by the shared package and the API: labels,
 * error messages, notifications. The web app's own screens are translated in
 * apps/web/src/locales/fr.ts.
 */
import { DEFAULT_CLUB_RULES, DEFAULT_MEET_RULES, DEFAULT_PAYMENT_INSTRUCTIONS } from '../defaults';

export const FR: Record<string, string> = {
  // ─── Default club texts (shown until an admin rewrites them) ───────────────
  [DEFAULT_CLUB_RULES]: `# Le respect avant tout
- Pas de course, pas de burn, pas de drift sur la voie publique.
- Pas de bruit près des habitations : bas régime et musique baissée à l'arrivée comme au départ.
- Laissez chaque lieu plus propre que vous ne l'avez trouvé.

# Rencontres secrètes
- Le lieu de rendez-vous est communiqué aux seuls membres confirmés, quelques heures avant le début.
- Ne partagez rien sur le lieu en dehors du club : ni story, ni tag, ni position en direct.

# Adhésion
- Votre badge est personnel. Apportez-le aux rencontres pour le contrôle à l'entrée.
- Les cotisations font vivre le club. Payez en envoyant un justificatif ou en main propre au trésorier.

# Sur la carte
- Le partage de position est facultatif et toujours approximatif (environ 100 m).
- Ne partagez jamais la position d'un autre membre en dehors de l'application.`,
  [DEFAULT_MEET_RULES]: `Pas de course, pas de burn, pas de bruit près des habitations.
Ne partagez rien sur le lieu en dehors du club.`,
  [DEFAULT_PAYMENT_INSTRUCTIONS]: `Payez le trésorier en main propre lors d'une rencontre, ou envoyez le montant par virement bancaire ou D17 et déposez le reçu ici. Demandez les coordonnées du compte à un organisateur.`,

  // ─── Roles, membership, meetups ────────────────────────────────────────────
  Member: 'Membre',
  Organizer: 'Organisateur',
  Treasurer: 'Trésorier',
  Admin: 'Admin',
  Pending: 'En attente',
  Active: 'Actif',
  'Dues due': 'Cotisation due',
  Expired: 'Expiré',
  Suspended: 'Suspendu',
  'Not approved': 'Non approuvé',
  Public: 'Public',
  Secret: 'Secret',
  Organizers: 'Organisateurs',
  Everyone: 'Tout le monde',
  'Active members': 'Membres actifs',
  'Organizers & staff': 'Organisateurs et équipe',

  // ─── Dates, dues ───────────────────────────────────────────────────────────
  now: 'maintenant',
  Yesterday: 'Hier',
  '{count}m': '{count} min',
  '{count}h': '{count} h',
  '{count}d': '{count} j',
  'Every month': 'Chaque mois',
  'Every year': 'Chaque année',
  'Every {months} months': 'Tous les {months} mois',
  'Entry fee & badge': "Frais d'entrée et badge",
  '{period} dues': 'Cotisation {period}',

  // ─── Validation ────────────────────────────────────────────────────────────
  'Expected YYYY-MM-DD': 'Format attendu : AAAA-MM-JJ',
  'Enter your full name': 'Saisissez votre nom complet',
  'Enter a valid phone number': 'Saisissez un numéro de téléphone valide',
  'Enter a valid phone number.': 'Saisissez un numéro de téléphone valide.',
  'Use at least 8 characters': 'Utilisez au moins 8 caractères',
  'Enter your password': 'Saisissez votre mot de passe',
  'Nothing to update': 'Rien à mettre à jour',
  'Title is too short': 'Le titre est trop court',
  'Latitude and longitude go together': 'La latitude et la longitude vont ensemble',
  'Write a few words': 'Écrivez quelques mots',
  'Invalid value': 'Valeur invalide',
  'Invalid request': 'Requête invalide',

  // ─── Errors ────────────────────────────────────────────────────────────────
  'Cannot reach the server. Check your connection.': 'Serveur injoignable. Vérifiez votre connexion.',
  'Request failed': 'La requête a échoué',
  'Something went wrong.': 'Une erreur est survenue.',
  'Too many attempts. Try again in {after}.': 'Trop de tentatives. Réessayez dans {after}.',
  'Please sign in': 'Veuillez vous connecter',
  'Your session has ended. Please sign in again.': 'Votre session a expiré. Reconnectez-vous.',
  'You are not allowed to do this': "Vous n'êtes pas autorisé à faire cela",
  'Resource not found': 'Élément introuvable',
  'Member not found': 'Membre introuvable',
  'Payment not found': 'Paiement introuvable',
  'Pending payment not found': 'Paiement en attente introuvable',
  'Proof not found': 'Justificatif introuvable',
  'Photo not found': 'Photo introuvable',
  'Meetup not found': 'Rencontre introuvable',
  'Announcement not found': 'Annonce introuvable',
  'Available to active members once your membership is confirmed.':
    'Réservé aux membres actifs, une fois votre adhésion confirmée.',
  'Available to active members.': 'Réservé aux membres actifs.',
  'Location sharing is available to active members.': 'Le partage de position est réservé aux membres actifs.',
  'Turn on location sharing first.': "Activez d'abord le partage de position.",
  'Current password is incorrect.': 'Le mot de passe actuel est incorrect.',
  'An account already exists with this phone number.': 'Un compte existe déjà avec ce numéro.',
  'Already registered. Sign in instead.': 'Déjà inscrit. Connectez-vous.',
  'Wrong phone number or password.': 'Numéro ou mot de passe incorrect.',
  'Send the payment as multipart/form-data.': 'Envoyez le paiement en multipart/form-data.',
  'Send the photo as multipart/form-data.': 'Envoyez la photo en multipart/form-data.',
  'The file is too large (max 8 MB).': 'Le fichier est trop volumineux (8 Mo max).',
  'Attach a photo or PDF of your payment.': 'Joignez une photo ou un PDF de votre paiement.',
  'Upload a photo (JPG, PNG, WEBP, HEIC) or a PDF.': 'Envoyez une photo (JPG, PNG, WEBP, HEIC) ou un PDF.',
  'The photo is too large (max 5 MB).': 'La photo est trop volumineuse (5 Mo max).',
  'Choose a photo.': 'Choisissez une photo.',
  'Upload a photo (JPG, PNG or WEBP).': 'Envoyez une photo (JPG, PNG ou WEBP).',
  'Up to {max} car photos. Remove one first.': "Jusqu'à {max} photos de voiture. Supprimez-en une d'abord.",
  'The entry fee is already awaiting review.': "Les frais d'entrée sont déjà en attente de vérification.",
  'The entry fee is already paid.': "Les frais d'entrée sont déjà payés.",
  'This membership request is closed.': "Cette demande d'adhésion est clôturée.",
  'Dues can be paid once the membership is active.': "La cotisation se paie une fois l'adhésion active.",
  'Up to {max} periods can be paid at once.': "Jusqu'à {max} périodes peuvent être payées en une fois.",
  'This payment has already been reviewed.': 'Ce paiement a déjà été traité.',
  'Ask another admin to change your own role or status.':
    'Demandez à un autre admin de modifier votre rôle ou votre statut.',
  'Only active members can be suspended.': 'Seuls les membres actifs peuvent être suspendus.',
  'Only pending requests can be declined.': 'Seules les demandes en attente peuvent être refusées.',
  'A member cannot be moved back to pending.': 'Un membre ne peut pas repasser en attente.',
  'Change your own password from your profile.': 'Changez votre mot de passe depuis votre profil.',
  'The start time is in the past.': "L'heure de début est déjà passée.",
  'This meetup was cancelled.': 'Cette rencontre a été annulée.',
  'This meetup has ended.': 'Cette rencontre est terminée.',
  'Your badge is issued once your membership is confirmed.': 'Votre badge est émis une fois votre adhésion confirmée.',
  'Place search is unavailable right now.': 'La recherche de lieux est indisponible pour le moment.',

  // ─── Pass check ────────────────────────────────────────────────────────────
  'This code has expired. Ask the member to open their pass again.':
    'Ce code a expiré. Demandez au membre de rouvrir son pass.',
  'This is not a valid Identity pass.': "Ce n'est pas un pass Identity valide.",
  'Dues are due: remind them to pay.': 'Cotisation due : rappelez-lui de payer.',
  'Membership not confirmed yet.': 'Adhésion pas encore confirmée.',
  'Dues expired.': 'Cotisation expirée.',
  'Membership suspended.': 'Adhésion suspendue.',
  'Not a member.': "N'est pas membre.",
  'Not active.': 'Non actif.',

  // ─── Notifications ─────────────────────────────────────────────────────────
  'Payment proof to review': 'Justificatif de paiement à vérifier',
  'In-person payment announced': 'Paiement en main propre annoncé',
  'New membership request': "Nouvelle demande d'adhésion",
  'Payment not accepted': 'Paiement refusé',
  'Contact the treasurer for details.': 'Contactez le trésorier pour plus de détails.',
  'Welcome to Identity': 'Bienvenue chez Identity',
  'Your membership is active. Badge {badge}.': 'Votre adhésion est active. Badge {badge}.',
  'Payment verified': 'Paiement vérifié',
  '{label} · valid until {date}': "{label} · valable jusqu'au {date}",
  'Payment recorded': 'Paiement enregistré',
  '{label} · {amount} paid in person': '{label} · {amount} payés en main propre',
  'You are now {role}': 'Vous êtes maintenant {role}',
  'New tools are available in the Admin section of your profile.':
    'De nouveaux outils sont disponibles dans la section Admin de votre compte.',
  'Membership reactivated': 'Adhésion réactivée',
  'Membership suspended': 'Adhésion suspendue',
  'Contact an admin for details.': 'Contactez un admin pour plus de détails.',
  'Membership request declined': "Demande d'adhésion refusée",
  'Contact the club for details.': 'Contactez le club pour plus de détails.',
  'New meetup: {title}': 'Nouvelle rencontre : {title}',
  '{when} · meeting point revealed {hours}h before': '{when} · lieu révélé {hours} h avant',
  'Meetup updated: {title}': 'Rencontre modifiée : {title}',
  'New time: {when}': 'Nouvel horaire : {when}',
  'The meeting point changed.': 'Le lieu de rendez-vous a changé.',
  'Cancelled: {title}': 'Annulée : {title}',
  'Announcement from the organizers': 'Annonce des organisateurs',
  'Announcement from the treasurer': 'Annonce du trésorier',
  'Announcement from the admin': "Annonce de l'admin",
  'Announcement from the club': 'Annonce du club',
};
