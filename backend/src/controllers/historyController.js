import prisma from '../config/prisma.js'

export const getHistory = async (req, res) => {
  try {
    const history = await prisma.history.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
    })
    res.json(history)
  } catch (error) {
    console.error('Get history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const upsertHistory = async (req, res) => {
  try {
    const { contentType, contentId, episodeId, title, poster, position, duration } = req.body

    const parsedPosition = Math.round(Number(position) || 0)
    const parsedDuration = Math.round(Number(duration) || 0)

    const history = await prisma.history.upsert({
      where: {
        userId_contentType_contentId: {
          userId: req.user.id,
          contentType,
          contentId: parseInt(contentId),
        },
      },
      update: {
        episodeId,
        title,
        poster,
        position: parsedPosition,
        duration: parsedDuration,
      },
      create: {
        userId: req.user.id,
        contentType,
        contentId: parseInt(contentId),
        episodeId,
        title,
        poster,
        position: parsedPosition,
        duration: parsedDuration,
      },
    })

    res.json(history)
  } catch (error) {
    console.error('Upsert history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const deleteHistoryItem = async (req, res) => {
  try {
    const { contentType, contentId } = req.params

    await prisma.history.deleteMany({
      where: {
        userId: req.user.id,
        contentType,
        contentId: parseInt(contentId),
      },
    })

    res.json({ message: 'History item deleted successfully' })
  } catch (error) {
    console.error('Delete history item error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const clearHistory = async (req, res) => {
  try {
    await prisma.history.deleteMany({
      where: { userId: req.user.id },
    })

    res.json({ message: 'History cleared successfully' })
  } catch (error) {
    console.error('Clear history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
